import { error } from '@sveltejs/kit';
import { canAccessAdmin } from '$lib/rbac';

type SessionUser = NonNullable<App.Locals['user']>;

/** ログイン必須。未ログインなら 401 を投げ、ログイン中はユーザーを返す。 */
export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) {
		throw error(401, 'ログインが必要です。');
	}
	return locals.user;
}

/** 管理者以上(admin / super_admin)必須。満たさなければ 403。 */
export function requireAdmin(locals: App.Locals): SessionUser {
	const user = requireUser(locals);
	if (!canAccessAdmin(user.role)) {
		throw error(403, '権限がありません。');
	}
	return user;
}

/** 作成APIでクライアントが採番した id。未指定なら undefined、形式不正なら 400。 */
export function clientId(body: unknown): string | undefined {
	const id = (body as { id?: unknown } | null)?.id;
	if (id === undefined) return undefined;
	if (typeof id !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(id))
		throw error(400, 'id が不正です。');
	return id;
}
