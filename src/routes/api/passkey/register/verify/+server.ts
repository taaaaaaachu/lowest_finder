import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { createSession } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/sessionCookie';
import { requireRecentAuth } from '$lib/server/apiGuard';
import { addPasskey, normalizePasskeyName } from '$lib/server/credentials';
import { countUsers, registerUser, REGISTER_ERROR_MESSAGES } from '$lib/server/invites';
import { takeChallenge, verifyRegistration } from '$lib/server/webauthn';
import type { RequestHandler } from './$types';

/** パスキー登録の完了。body: { response, name }。 */
export const POST: RequestHandler = async ({ locals, request, cookies, url }) => {
	const stored = takeChallenge(cookies, 'reg');
	if (!stored?.pending) throw error(400, '登録の有効期限が切れました。もう一度お試しください。');
	const { pending } = stored;

	const body = await request.json().catch(() => null);
	const name = normalizePasskeyName(body?.name);
	if (name === null) throw error(400, 'パスキー名は50文字以内にしてください。');

	const cred = await verifyRegistration(url, body?.response, stored.challenge);
	if (!cred) throw error(400, 'パスキーを確認できませんでした。');
	const passkey = { ...cred, name, createdAt: Date.now() };

	if (pending.kind === 'add') {
		const user = requireRecentAuth(locals);
		if (user.id !== pending.userId) throw error(403, '権限がありません。');
		try {
			addPasskey(db, { ...passkey, userId: user.id });
		} catch {
			throw error(409, 'このパスキーは登録済みです。');
		}
		return json({ ok: true });
	}

	// 招待の要否とロールは確定時点で判定し直す(開始後に別の人がブートストラップした場合に備える)。
	const requireInvite = countUsers(db) > 0;
	const result = registerUser(db, {
		id: pending.userId,
		username: pending.username,
		passwordHash: null,
		passkey,
		requireInvite,
		inviteCode: pending.inviteCode,
		role: requireInvite ? 'user' : 'super_admin'
	});
	if (!result.ok) {
		throw error(result.error === 'username_taken' ? 409 : 400, REGISTER_ERROR_MESSAGES[result.error]);
	}

	const { token, expiresAt } = createSession(result.user.id);
	setSessionCookie(cookies, token, expiresAt);
	return json({ ok: true });
};
