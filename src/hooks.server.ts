import type { Handle } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	validateSessionToken,
	invalidateSession
} from '$lib/server/auth';
import { dev } from '$app/environment';

/** Cookie の共通属性。HTTPS 前提(Cloudflare Tunnel)なので Secure を付ける。 */
function cookieOpts(expires: Date) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: !dev,
		expires
	};
}

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = null;

	if (token) {
		const result = validateSessionToken(token);
		if (result) {
			event.locals.user = result.user;
			// スライディング延長された場合は Cookie の期限も更新。
			if (result.renewedExpiresAt) {
				event.cookies.set(SESSION_COOKIE, token, cookieOpts(new Date(result.renewedExpiresAt)));
			}
		} else {
			// 無効トークンは掃除する。
			invalidateSession(token);
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	return resolve(event);
};
