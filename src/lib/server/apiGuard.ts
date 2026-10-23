import { error } from '@sveltejs/kit';
import { canAccessAdmin } from '$lib/rbac';
import { isRecentlyVerified } from './auth';

type SessionUser = NonNullable<App.Locals['user']>;

/** ログイン必須。未ログインなら 401 を投げ、ログイン中はユーザーを返す。 */
export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) {
		throw error(401, 'ログインが必要です。');
	}
	return locals.user;
}

/** 認証情報の変更で直近の本人確認を求める HTTP ステータス(428 Precondition Required)。 */
export const REAUTH_REQUIRED = 428;

/**
 * ログイン必須かつ直近に本人確認(ログイン・再認証)済み。満たさなければ 428。
 * 戻り値の sessionId は「操作端末以外のセッションを無効化」に使う。
 */
export function requireRecentAuth(locals: App.Locals): SessionUser & { sessionId: string } {
	const user = requireUser(locals);
	if (!locals.session || !isRecentlyVerified(locals.session.verifiedAt)) {
		throw error(REAUTH_REQUIRED, '本人確認が必要です。');
	}
	return { ...user, sessionId: locals.session.id };
}

/** 仮パスワードの会員でも使える API。パスワード変更・パスキー登録と、その前の本人確認だけ(docs/adr/0007)。 */
const TEMPORARY_PASSWORD_APIS = new Set([
	'/api/account/password',
	'/api/account/reauth',
	'/api/passkey/auth/options',
	'/api/passkey/register/options',
	'/api/passkey/register/verify'
]);

/** 仮パスワードの会員がこの API を呼べるか。 */
export function allowedWithTemporaryPassword(pathname: string): boolean {
	return TEMPORARY_PASSWORD_APIS.has(pathname);
}

/** 管理者以上(admin / super_admin)必須。満たさなければ 403。 */
export function requireAdmin(locals: App.Locals): SessionUser {
	const user = requireUser(locals);
	if (!canAccessAdmin(user.role)) {
		throw error(403, '権限がありません。');
	}
	return user;
}

/** 作成APIでクライアントが採番した id。未指定なら undefined、形式不正なら 400。 */
export function clientId(body: unknown): string | undefined {
	const id = (body as { id?: unknown } | null)?.id;
	if (id === undefined) return undefined;
	if (typeof id !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(id))
		throw error(400, 'id が不正です。');
	return id;
}
