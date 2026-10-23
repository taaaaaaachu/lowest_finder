import { and, eq, ne, gt, asc } from 'drizzle-orm';
import type { Db } from './db';
import { users, sessions, passkeys, resetLinks, type Role } from './db/schema';
import { canDeleteUser, canResetPassword, canSetRole } from '$lib/rbac';

export interface Actor {
	id: string;
	role: Role;
}

export interface AdminUser {
	id: string;
	username: string;
	role: Role;
	createdAt: number;
	/** 未使用で期限内のリセットリンクの期限。無ければ null。 */
	resetLinkExpiresAt: number | null;
}

export type AdminError = 'not_found' | 'forbidden' | 'last_super_admin';
export type AdminResult = { ok: true } | { ok: false; error: AdminError };

/** super_admin の人数。last-super-admin ガードに使う。 */
export function countSuperAdmins(db: Db): number {
	return db.select({ id: users.id }).from(users).where(eq(users.role, 'super_admin')).all().length;
}

/** 全ユーザーを作成順に返す(管理画面用)。 */
export function listUsers(db: Db, now = Date.now()): AdminUser[] {
	return db
		.select({
			id: users.id,
			username: users.username,
			role: users.role,
			createdAt: users.createdAt,
			resetLinkExpiresAt: resetLinks.expiresAt
		})
		.from(users)
		.leftJoin(resetLinks, and(eq(resetLinks.userId, users.id), gt(resetLinks.expiresAt, now)))
		.orderBy(asc(users.createdAt))
		.all();
}

/** 指定ユーザーのセッションを削除する。keepSessionId を渡すとその1件だけ残す。 */
export function deleteUserSessions(db: Db, userId: string, keepSessionId?: string): void {
	if (keepSessionId) {
		db.delete(sessions)
			.where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)))
			.run();
	} else {
		db.delete(sessions).where(eq(sessions.userId, userId)).run();
	}
}

/** ロールを変更する(任命/罷免)。権限と last-super-admin ガードを適用。 */
export function setUserRole(
	db: Db,
	actor: Actor,
	targetId: string,
	newRole: Role
): AdminResult {
	const target = db.select().from(users).where(eq(users.id, targetId)).get();
	if (!target) return { ok: false, error: 'not_found' };
	if (!canSetRole(actor.role, target.role, newRole)) return { ok: false, error: 'forbidden' };

	// super_admin を降格させるとき、それが最後の1人なら拒否。
	if (target.role === 'super_admin' && newRole !== 'super_admin' && countSuperAdmins(db) <= 1) {
		return { ok: false, error: 'last_super_admin' };
	}

	db.update(users).set({ role: newRole }).where(eq(users.id, targetId)).run();
	return { ok: true };
}

/** ユーザーを削除する。権限と last-super-admin ガードを適用(FK で関連データは連鎖処理)。 */
export function deleteUser(db: Db, actor: Actor, targetId: string): AdminResult {
	const target = db.select().from(users).where(eq(users.id, targetId)).get();
	if (!target) return { ok: false, error: 'not_found' };
	if (!canDeleteUser(actor.role, target.role)) return { ok: false, error: 'forbidden' };

	// 最後の super_admin は削除できない(自分でも他人でも)。
	if (target.role === 'super_admin' && countSuperAdmins(db) <= 1) {
		return { ok: false, error: 'last_super_admin' };
	}

	db.delete(users).where(eq(users.id, targetId)).run();
	return { ok: true };
}

/** actor が targetId の会員をパスワードリセット(仮パスワード・リセットリンク)の対象にできないなら、その理由。 */
export function resetTargetError(db: Db, actor: Actor, targetId: string): AdminError | null {
	const target = db.select({ role: users.role }).from(users).where(eq(users.id, targetId)).get();
	if (!target) return 'not_found';
	// 自分の認証情報はアカウント画面で変える(docs/adr/0007)。
	if (actor.id === targetId || !canResetPassword(actor.role, target.role)) return 'forbidden';
	return null;
}

/**
 * 管理者による他人のパスワードリセット(認証情報の全初期化)。
 * 新パスワードを設定し、対象者の全パスキーと全セッションを削除する(docs/adr/0006)。
 */
export function resetUserPassword(
	db: Db,
	actor: Actor,
	targetId: string,
	newPasswordHash: string
): AdminResult {
	const err = resetTargetError(db, actor, targetId);
	if (err) return { ok: false, error: err };

	db.transaction((tx) => {
		// 管理者が知っているパスワードなので仮パスワードにする(本人が変えるまで他の操作は不可)。
		tx.update(users)
			.set({ passwordHash: newPasswordHash, passwordTemporary: true })
			.where(eq(users.id, targetId))
			.run();
		tx.delete(passkeys).where(eq(passkeys.userId, targetId)).run();
		tx.delete(sessions).where(eq(sessions.userId, targetId)).run();
		// 未使用のリセットリンクも使えなくする。
		tx.delete(resetLinks).where(eq(resetLinks.userId, targetId)).run();
	});
	return { ok: true };
}

/**
 * 本人によるパスワード変更。現在パスワードの検証は呼び出し側で済ませておく。
 * 新ハッシュを設定し、keepSessionId(操作中の端末)以外のセッションを無効化する。
 */
export function setOwnPassword(
	db: Db,
	userId: string,
	newPasswordHash: string,
	keepSessionId: string
): void {
	db.update(users)
		.set({ passwordHash: newPasswordHash, passwordTemporary: false })
		.where(eq(users.id, userId))
		.run();
	deleteUserSessions(db, userId, keepSessionId);
}
