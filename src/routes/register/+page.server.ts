import { fail, redirect } from '@sveltejs/kit';
import {
	createSession,
	createUser,
	validatePassword,
	validateUsername
} from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/sessionCookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// ログイン済みならトップへ。
	if (locals.user) throw redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');

		const uErr = validateUsername(username);
		if (uErr) return fail(400, { username, error: uErr });
		const pErr = validatePassword(password);
		if (pErr) return fail(400, { username, error: pErr });

		const user = await createUser(username, password);
		if (!user) {
			return fail(409, { username, error: 'このユーザー名は既に使われています。' });
		}

		const { token, expiresAt } = createSession(user.id);
		setSessionCookie(cookies, token, expiresAt);

		// 登録直後はトップへ。ゲストデータの取り込み確認はクライアント側で行う。
		throw redirect(303, '/?welcome=1');
	}
};
