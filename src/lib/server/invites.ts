import { and, eq, desc, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { randomBytes } from 'node:crypto';
import type { Db } from './db';
import { users, invites, passkeys, type InviteRow, type UserRow, type Role, type PasskeyRow } from './db/schema';

export function newId(): string {
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
			usedAt: null,
			revokedAt: null
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

export type InviteState = 'active' | 'used' | 'expired' | 'revoked';

/** 招待の状態を判定する。優先順位: revoked > used > expired > active。 */
export function inviteState(
	inv: Pick<InviteRow, 'usedBy' | 'expiresAt' | 'revokedAt'>,
	now = Date.now()
): InviteState {
	if (inv.revokedAt !== null) return 'revoked';
	if (inv.usedBy) return 'used';
	if (inv.expiresAt !== null && now >= inv.expiresAt) return 'expired';
	return 'active';
}

export interface AdminInvite {
	id: string;
	code: string;
	createdAt: number;
	expiresAt: number | null;
	usedAt: number | null;
	revokedAt: number | null;
	/** 発行者のユーザー名(削除済みなら null)。 */
	issuer: string | null;
	/** 使用者のユーザー名(未使用なら null)。 */
	invitee: string | null;
	state: InviteState;
}

/** 全ての招待を新しい順に返す(発行者を問わないグローバル一覧。管理者以上向け)。 */
export function listAllInvites(db: Db): AdminInvite[] {
	const issuer = alias(users, 'issuer');
	const invitee = alias(users, 'invitee');
	const now = Date.now();
	return db
		.select({
			id: invites.id,
			code: invites.code,
			createdAt: invites.createdAt,
			expiresAt: invites.expiresAt,
			usedAt: invites.usedAt,
			revokedAt: invites.revokedAt,
			usedBy: invites.usedBy,
			issuer: issuer.username,
			invitee: invitee.username
		})
		.from(invites)
		.leftJoin(issuer, eq(invites.createdBy, issuer.id))
		.leftJoin(invitee, eq(invites.usedBy, invitee.id))
		.orderBy(desc(invites.createdAt))
		.all()
		.map((r) => ({
			id: r.id,
			code: r.code,
			createdAt: r.createdAt,
			expiresAt: r.expiresAt,
			usedAt: r.usedAt,
			revokedAt: r.revokedAt,
			issuer: r.issuer,
			invitee: r.invitee,
			state: inviteState({ usedBy: r.usedBy, expiresAt: r.expiresAt, revokedAt: r.revokedAt }, now)
		}));
}

/** 招待を無効化する(行は残す)。未使用・未無効化のものだけ対象。成功したら true。 */
export function revokeInvite(db: Db, id: string): boolean {
	const res = db
		.update(invites)
		.set({ revokedAt: Date.now() })
		.where(and(eq(invites.id, id), isNull(invites.usedBy), isNull(invites.revokedAt)))
		.run();
	return res.changes > 0;
}

/** 招待を完全に削除する。成功したら true。 */
export function deleteInvite(db: Db, id: string): boolean {
	const res = db.delete(invites).where(eq(invites.id, id)).run();
	return res.changes > 0;
}

export type RegisterError =
	| 'invite_invalid'
	| 'invite_expired'
	| 'invite_used'
	| 'invite_revoked'
	| 'username_taken';
export const REGISTER_ERROR_MESSAGES: Record<RegisterError, string> = {
	invite_invalid: '招待コードが正しくありません。',
	invite_expired: 'この招待コードは有効期限が切れています。',
	invite_used: 'この招待コードは既に使われています。',
	invite_revoked: 'この招待コードは無効化されています。',
	username_taken: 'このユーザー名は既に使われています。'
};
export type RegisterResult = { ok: true; user: UserRow } | { ok: false; error: RegisterError };

function findInviteError(db: Db, code: string, now: number): { invite?: InviteRow; error?: RegisterError } {
	const invite = db.select().from(invites).where(eq(invites.code, code)).get();
	if (!invite) return { error: 'invite_invalid' };
	if (invite.revokedAt !== null) return { error: 'invite_revoked' };
	if (invite.usedBy) return { error: 'invite_used' };
	if (invite.expiresAt !== null && now >= invite.expiresAt) return { error: 'invite_expired' };
	return { invite };
}

/**
 * 登録できそうかを事前に確かめる(パスキー登録でブラウザの操作に入る前の検証)。
 * 確定の検証は registerUser のトランザクション内で改めて行う。
 */
export function precheckRegistration(
	db: Db,
	params: { username: string; requireInvite: boolean; inviteCode?: string }
): RegisterError | null {
	if (params.requireInvite) {
		const { error } = findInviteError(db, params.inviteCode ?? '', Date.now());
		if (error) return error;
	}
	const taken = db.select({ id: users.id }).from(users).where(eq(users.username, params.username.trim())).get();
	return taken ? 'username_taken' : null;
}

/**
 * ユーザーを作成する。requireInvite が true のときは招待コードを検証・消費する。
 * 招待の検証・消費とユーザー作成を 1 トランザクションで行い、
 * 同じコードでの同時登録を防ぐ。パスワードのハッシュ化は呼び出し側で済ませておく。
 */
export function registerUser(
	db: Db,
	params: {
		/** 省略時は新規採番。パスキー登録ではオプション生成時に決めた id を渡す。 */
		id?: string;
		username: string;
		/** null ならパスワードなし(passkey 必須)。 */
		passwordHash: string | null;
		/** パスキーで登録する場合の認証情報。ユーザー作成と同じトランザクションで保存する。 */
		passkey?: Omit<PasskeyRow, 'userId' | 'lastUsedAt'>;
		requireInvite: boolean;
		inviteCode?: string;
		/** 付与するロール。ブートストラップ時は super_admin、通常は user。 */
		role: Role;
	}
): RegisterResult {
	if (!params.passwordHash && !params.passkey) {
		throw new Error('パスワードかパスキーのどちらかが必要です。');
	}
	const now = Date.now();
	try {
		return db.transaction((tx): RegisterResult => {
			let invite: InviteRow | undefined;
			if (params.requireInvite) {
				const found = findInviteError(db, params.inviteCode ?? '', now);
				if (found.error) return { ok: false, error: found.error };
				invite = found.invite;
			}

			const user: UserRow = {
				id: params.id ?? newId(),
				username: params.username.trim(),
				passwordHash: params.passwordHash,
				passwordTemporary: false,
				role: params.role,
				createdAt: now
			};
			try {
				tx.insert(users).values(user).run();
			} catch {
				// UNIQUE 制約違反 = ユーザー名重複。トランザクションはロールバックされる。
				return { ok: false, error: 'username_taken' };
			}

			if (params.passkey) {
				tx.insert(passkeys).values({ ...params.passkey, userId: user.id }).run();
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
