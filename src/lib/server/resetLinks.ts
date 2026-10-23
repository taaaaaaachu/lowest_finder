import { and, eq, gt } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from './db';
import { users, sessions, passkeys, resetLinks, type PasskeyRow } from './db/schema';
import { resetTargetError, type Actor, type AdminError } from './admin';

/**
 * リセットリンク(docs/adr/0007)。発行しただけでは何も変えず、使った時点で
 * 認証情報(パスワード・全パスキー・全セッション)を初期化して新しいものに置き換える。
 */

export const RESET_LINK_TTL_MS = 1000 * 60 * 60 * 24;

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export type IssueResult =
	| { ok: true; token: string; expiresAt: number }
	| { ok: false; error: AdminError };

/** リンクを発行する。未使用の古いリンクは置き換わって使えなくなる。 */
export function issueResetLink(db: Db, actor: Actor, targetId: string, now = Date.now()): IssueResult {
	const err = resetTargetError(db, actor, targetId);
	if (err) return { ok: false, error: err };

	const token = randomBytes(32).toString('base64url');
	const expiresAt = now + RESET_LINK_TTL_MS;
	db.transaction(() => {
		db.delete(resetLinks).where(eq(resetLinks.userId, targetId)).run();
		db.insert(resetLinks)
			.values({ id: hashToken(token), userId: targetId, createdBy: actor.id, createdAt: now, expiresAt })
			.run();
	});
	return { ok: true, token, expiresAt };
}

/** 未使用のリンクを取り消す。 */
export function revokeResetLink(db: Db, actor: Actor, targetId: string): { ok: true } | { ok: false; error: AdminError } {
	const err = resetTargetError(db, actor, targetId);
	if (err) return { ok: false, error: err };
	db.delete(resetLinks).where(eq(resetLinks.userId, targetId)).run();
	return { ok: true };
}

/** 有効なリンクの対象者。無効(不明・期限切れ・使用済み)なら null。 */
export function findResetLink(
	db: Db,
	token: string,
	now = Date.now()
): { userId: string; username: string } | null {
	return (
		db
			.select({ userId: users.id, username: users.username })
			.from(resetLinks)
			.innerJoin(users, eq(resetLinks.userId, users.id))
			.where(and(eq(resetLinks.id, hashToken(token)), gt(resetLinks.expiresAt, now)))
			.get() ?? null
	);
}

/** リンクで設定する新しい認証情報。パスワード(仮パスワードにはしない)かパスキー。 */
export type NewCredential =
	| { passwordHash: string }
	| { passkey: Omit<PasskeyRow, 'userId' | 'lastUsedAt'> };

/**
 * リンクを使う。認証情報を全初期化して新しいものに置き換え、リンクを消費する。
 * 成功なら対象者の id、リンクが無効なら null。
 */
export function consumeResetLink(
	db: Db,
	token: string,
	credential: NewCredential,
	now = Date.now()
): string | null {
	return db.transaction(() => {
		const link = findResetLink(db, token, now);
		if (!link) return null;
		const { userId } = link;
		db.delete(passkeys).where(eq(passkeys.userId, userId)).run();
		db.delete(sessions).where(eq(sessions.userId, userId)).run();
		db.delete(resetLinks).where(eq(resetLinks.userId, userId)).run();
		if ('passwordHash' in credential) {
			db.update(users)
				.set({ passwordHash: credential.passwordHash, passwordTemporary: false })
				.where(eq(users.id, userId))
				.run();
		} else {
			db.update(users).set({ passwordHash: null, passwordTemporary: false }).where(eq(users.id, userId)).run();
			db.insert(passkeys).values({ ...credential.passkey, userId }).run();
		}
		return userId;
	});
}
