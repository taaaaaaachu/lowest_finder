import { authenticationOptions, saveChallenge } from '#lib/server/webauthn.js';
import type { RequestHandler } from './$types';

/** パスキー認証の開始(ログインと再認証で共用)。 */
export const POST: RequestHandler = async ({ cookies, url }) => {
	const opts = await authenticationOptions(url);
	saveChallenge(cookies, 'auth', opts.challenge);
	return Response.json(opts);
};
