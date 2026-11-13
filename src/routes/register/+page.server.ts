import { fail, redirect } from '@sveltejs/kit';
import {
	createSession,
	hashPassword,
	validatePassword,
	validateUsername
} from '#lib/server/auth.js';
import { setSessionCookie } from '#lib/server/sessionCookie.js';
import { db } from '#lib/server/db/index.js';
import {
	countUsers,
	previewInvite,
	registerUser,
	unusableInviteMessage,
	REGISTER_ERROR_MESSAGES
} from '#lib/server/invites.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) throw redirect(303, '/');
	// 招待リンク(/invite/<コード>)から来たときはコードが付く。使えるならコード欄を隠す。
	const code = url.searchParams.get('invite');
	const preview = code ? previewInvite(db, code) : null;
	return {
		// ユーザーが 0 人のときだけ招待コードなしで登録できる(ブートストラップ)。
		requireInvite: countUsers(db) > 0,
		inviteLink: code ? { code, issuer: preview?.issuer ?? null, unusable: unusableInviteMessage(preview) } : null
	};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');
		const inviteCode = String(data.get('invite') ?? '').trim();

		const requireInvite = countUsers(db) > 0;

		const uErr = validateUsername(username);
		if (uErr) return fail(400, { username, error: uErr });
		const pErr = validatePassword(password);
		if (pErr) return fail(400, { username, error: pErr });
		if (requireInvite && !inviteCode) {
			return fail(400, { username, error: '招待コードを入力してください。' });
		}

		const passwordHash = await hashPassword(password);
		// ブートストラップ(ユーザー0人)の 1 人目は super_admin。以降は user。
		const role = requireInvite ? 'user' : 'super_admin';
		const result = registerUser(db, { username, passwordHash, requireInvite, inviteCode, role });
		if (!result.ok) {
			const status = result.error === 'username_taken' ? 409 : 400;
			return fail(status, { username, error: REGISTER_ERROR_MESSAGES[result.error] });
		}

		const { token, expiresAt } = createSession(result.user.id);
		setSessionCookie(cookies, token, expiresAt);
		throw redirect(303, '/?welcome=1');
	}
};
