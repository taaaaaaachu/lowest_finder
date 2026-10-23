import { json, type Handle } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	validateSessionToken,
	invalidateSession
} from '$lib/server/auth';
import { dev } from '$app/environment';
import { allowedWithTemporaryPassword } from '$lib/server/apiGuard';

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
	event.locals.session = null;

	if (token) {
		const result = validateSessionToken(token);
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
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

	// 仮パスワードの会員は変更を済ませるまで他の API を使えない(ページ側はルートレイアウトで変更画面へ戻す)。
	const path = event.url.pathname;
	if (
		event.locals.user?.passwordTemporary &&
		path.startsWith('/api/') &&
		!allowedWithTemporaryPassword(path)
	) {
		return json({ message: 'パスワードの変更が必要です。' }, { status: 403 });
	}

	return resolve(event);
};
