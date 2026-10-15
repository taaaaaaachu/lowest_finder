import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { markSessionVerified, verifyCredentials } from '$lib/server/auth';
import { requireUser } from '$lib/server/apiGuard';
import { rateLimit } from '$lib/server/rateLimit';
import { takeChallenge, verifyAuthentication } from '$lib/server/webauthn';
import type { RequestHandler } from './$types';

/** 本人確認(再認証)。body: { password } または { response }(パスキーの認証応答)。 */
export const POST: RequestHandler = async ({ locals, request, cookies, url }) => {
	const user = requireUser(locals);
	const rl = rateLimit(`reauth:${user.id}`, 10, 60_000);
	if (!rl.allowed) {
		throw error(429, `試行が多すぎます。${rl.retryAfterSec}秒後に再試行してください。`);
	}
	const body = await request.json().catch(() => null);

	let ok = false;
	if (typeof body?.password === 'string') {
		ok = (await verifyCredentials(user.username, body.password)) !== null;
	} else {
		const stored = takeChallenge(cookies, 'auth');
		const passkey = stored && (await verifyAuthentication(db, url, body?.response, stored.challenge));
		// 他人のパスキーでは本人確認にならない。
		ok = !!passkey && passkey.userId === user.id;
	}
	if (!ok) throw error(400, '本人確認できませんでした。');

	markSessionVerified(locals.session!.id);
	return json({ ok: true });
};
