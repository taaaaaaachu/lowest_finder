import { and, eq, desc } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Db } from './db';
import { users, invites, type InviteRow, type UserRow } from './db/schema';

function newId(): string {
	return randomBytes(16).toString('hex');
}

/** 人が入力しうる招待コード(base64url・12文字程度)。 */
function newInviteCode(): string {
	return randomBytes(9).toString('base64url');
}

/** 登録済みユーザー数。0 のときだけ招待コードなしの登録を許す(ブートストラップ)。 */
export function countUsers(db: Db): number {
	return db.select({ id: users.id }).from(users).all().length;
}

/** 招待コードを発行する。expiresAt が null なら無期限。 */
export function createInvite(db: Db, userId: string, expiresAt: number | null): InviteRow {
	// 衝突はほぼ起きないが一応リトライ。
	for (let i = 0; i < 5; i++) {
		const row: InviteRow = {
			id: newId(),
			code: newInviteCode(),
			createdBy: userId,
			createdAt: Date.now(),
			expiresAt,
			usedBy: null,
			usedAt: null
		};
		try {
			db.insert(invites).values(row).run();
			return row;
		} catch {
			// code の UNIQUE 衝突 → 生成し直し。
		}
	}
	throw new Error('招待コードの生成に失敗しました。');
}

export interface InviteStatus extends InviteRow {
	status: 'active' | 'used' | 'expired';
}

/** 自分が発行した招待コードを新しい順に返す(状態付き)。 */
export function listInvites(db: Db, userId: string): InviteStatus[] {
	const now = Date.now();
	return db
		.select()
		.from(invites)
		.where(eq(invites.createdBy, userId))
		.orderBy(desc(invites.createdAt))
		.all()
		.map((inv) => ({
			...inv,
			status: inv.usedBy
				? ('used' as const)
				: inv.expiresAt !== null && now >= inv.expiresAt
					? ('expired' as const)
					: ('active' as const)
		}));
}

export type RegisterResult =
	| { ok: true; user: UserRow }
	| { ok: false; error: 'invite_invalid' | 'invite_expired' | 'invite_used' | 'username_taken' };

/**
 * ユーザーを作成する。requireInvite が true のときは招待コードを検証・消費する。
 * 招待の検証・消費とユーザー作成を 1 トランザクションで行い、
 * 同じコードでの同時登録を防ぐ。パスワードのハッシュ化は呼び出し側で済ませておく。
 */
export function registerUser(
	db: Db,
	params: {
		username: string;
		passwordHash: string;
		requireInvite: boolean;
		inviteCode?: string;
	}
): RegisterResult {
	const now = Date.now();
	try {
		return db.transaction((tx): RegisterResult => {
			let invite: InviteRow | undefined;
			if (params.requireInvite) {
				invite = tx
					.select()
					.from(invites)
					.where(eq(invites.code, params.inviteCode ?? ''))
					.get();
				if (!invite) return { ok: false, error: 'invite_invalid' };
				if (invite.usedBy) return { ok: false, error: 'invite_used' };
				if (invite.expiresAt !== null && now >= invite.expiresAt) {
					return { ok: false, error: 'invite_expired' };
				}
			}

			const user: UserRow = {
				id: newId(),
				username: params.username.trim(),
				passwordHash: params.passwordHash,
				createdAt: now
			};
			try {
				tx.insert(users).values(user).run();
			} catch {
				// UNIQUE 制約違反 = ユーザー名重複。トランザクションはロールバックされる。
				return { ok: false, error: 'username_taken' };
			}

			if (invite) {
				tx.update(invites)
					.set({ usedBy: user.id, usedAt: now })
					.where(and(eq(invites.id, invite.id), eq(invites.code, invite.code)))
					.run();
			}

			return { ok: true, user };
		});
	} catch {
		// username_taken 等で return した場合でも better-sqlite3 は例外を投げないが、
		// 予期せぬ例外は登録失敗として扱う。
		return { ok: false, error: 'username_taken' };
	}
}
