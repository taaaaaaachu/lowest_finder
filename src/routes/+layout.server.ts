import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/** 仮パスワードの会員が開いてよいページ。 */
const TEMPORARY_PASSWORD_PAGES = ['/change-password', '/logout'];

export const load: LayoutServerLoad = async ({ locals, depends, url }) => {
	// ロール変更をヘッダーへ反映するため、invalidate('app:user') で読み直せるようにする。
	depends('app:user');
	// url は仮パスワードのときだけ参照する(参照すると遷移のたびに読み直され、オフラインで遷移できなくなる)。
	if (locals.user?.passwordTemporary && !TEMPORARY_PASSWORD_PAGES.includes(url.pathname)) {
		throw redirect(303, '/change-password');
	}
	return { user: locals.user };
};
