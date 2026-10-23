import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { createSession } from '#lib/server/auth.js';
import { setSessionCookie } from '#lib/server/sessionCookie.js';
import { takeChallenge, verifyAuthentication } from '#lib/server/webauthn.js';
import type { RequestHandler } from './$types';

/** パスキーでログインする。body: { response }。 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const stored = takeChallenge(cookies, 'auth');
	if (!stored) throw error(400, 'ログインの有効期限が切れました。もう一度お試しください。');
	const body = await request.json().catch(() => null);

	const passkey = await verifyAuthentication(db, url, body?.response, stored.challenge);
	if (!passkey) throw error(401, 'パスキーでログインできませんでした。');

	const { token, expiresAt } = createSession(passkey.userId);
	setSessionCookie(cookies, token, expiresAt);
	return Response.json({ ok: true });
};
