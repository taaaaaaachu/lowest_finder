import { fail, redirect } from '@sveltejs/kit';
import { createSession, verifyCredentials } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/sessionCookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');

		if (!username || !password) {
			return fail(400, { username, error: 'ユーザー名とパスワードを入力してください。' });
		}

		const user = await verifyCredentials(username, password);
		if (!user) {
			// ユーザー名/パスワードのどちらが誤りかは明かさない。
			return fail(401, { username, error: 'ユーザー名またはパスワードが違います。' });
		}

		const { token, expiresAt } = createSession(user.id);
		setSessionCookie(cookies, token, expiresAt);

		throw redirect(303, '/?welcome=1');
	}
};
