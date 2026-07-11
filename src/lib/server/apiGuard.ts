import { error } from '@sveltejs/kit';

/** ログイン必須。未ログインなら 401 を投げ、ログイン中はユーザーを返す。 */
export function requireUser(locals: App.Locals): { id: string; username: string } {
	if (!locals.user) {
		throw error(401, 'ログインが必要です。');
	}
	return locals.user;
}
