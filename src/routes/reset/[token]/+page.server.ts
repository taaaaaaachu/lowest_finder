import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { createSession, hashPassword, validatePassword } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/sessionCookie';
import { consumeResetLink, findResetLink } from '$lib/server/resetLinks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const link = findResetLink(db, params.token);
	return { username: link?.username ?? null };
};

export const actions: Actions = {
	/** 新しいパスワードを設定してログインする(パスキーは /api/passkey/register で行う)。 */
	default: async ({ params, request, cookies }) => {
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		if (password !== String(data.get('password2') ?? '')) {
			return fail(400, { error: '新しいパスワード(確認)が一致しません。' });
		}
		const pErr = validatePassword(password);
		if (pErr) return fail(400, { error: pErr });

		const userId = consumeResetLink(db, params.token, { passwordHash: await hashPassword(password) });
		if (!userId) return fail(410, { error: 'このリンクは使えません。管理者に再発行を依頼してください。' });

		const { token, expiresAt } = createSession(userId);
		setSessionCookie(cookies, token, expiresAt);
		throw redirect(303, '/');
	}
};
