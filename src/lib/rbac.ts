// クライアント・サーバー両方から使う純粋な権限判定。副作用・DB依存なし。

/** ロールの値。super_admin > admin > user の厳格な階層。 */
export type Role = 'super_admin' | 'admin' | 'user';

/** 役割の序列。 */
const RANK: Record<Role, number> = { user: 0, admin: 1, super_admin: 2 };

/** actor が min 以上の役割か。 */
export function isAtLeast(actor: Role, min: Role): boolean {
	return RANK[actor] >= RANK[min];
}

/** 管理ページ(/admin/*)にアクセスできるか(= admin 以上)。 */
export function canAccessAdmin(actor: Role): boolean {
	return isAtLeast(actor, 'admin');
}

/** 招待の発行・一覧・無効化・削除ができるか(= admin 以上)。 */
export function canManageInvites(actor: Role): boolean {
	return isAtLeast(actor, 'admin');
}

/**
 * actor が target(現在 targetCurrent)のロールを newRole に変更できるか。
 * - super_admin: 任意のロールへ変更可(last-super-admin ガードは別途 DB 側で判定)。
 * - admin: user → admin の昇格のみ可。
 * - user: 不可。
 */
export function canSetRole(actor: Role, targetCurrent: Role, newRole: Role): boolean {
	if (actor === 'super_admin') return true;
	if (actor === 'admin') return targetCurrent === 'user' && newRole === 'admin';
	return false;
}

/**
 * actor が target(ロール targetRole)を削除できるか。
 * - super_admin: 誰でも(自分含む。last-super-admin ガードは別途)。
 * - admin: 一般ユーザーのみ。
 */
export function canDeleteUser(actor: Role, targetRole: Role): boolean {
	if (actor === 'super_admin') return true;
	if (actor === 'admin') return targetRole === 'user';
	return false;
}

/**
 * actor が target(ロール targetRole)のパスワードをリセットできるか(管理者リセット)。
 * - super_admin: 誰でも。
 * - admin: 一般ユーザーのみ。
 */
export function canResetPassword(actor: Role, targetRole: Role): boolean {
	if (actor === 'super_admin') return true;
	if (actor === 'admin') return targetRole === 'user';
	return false;
}
