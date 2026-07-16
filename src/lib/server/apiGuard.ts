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
