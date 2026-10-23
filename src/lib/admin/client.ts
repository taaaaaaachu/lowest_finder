import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { Role } from '#lib/rbac.js';

/** API の失敗。status で「本人確認が必要(428)」などを判別できる。 */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

/** 認証情報の変更に直近の本人確認が要るときのステータス(サーバーの REAUTH_REQUIRED)。 */
export const REAUTH_REQUIRED = 428;

/** 管理系 API 用の共通 fetch。失敗時はサーバーのメッセージで例外を投げる。 */
async function api<T>(input: string, init?: RequestInit): Promise<T> {
	const res = await fetch(input, {
		...init,
		headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
	});
	if (!res.ok) {
		let message = `リクエストに失敗しました (${res.status})`;
		try {
			const body = await res.json();
			if (body?.message) message = body.message;
		} catch {
			/* 非 JSON はそのまま */
		}
		throw new ApiError(message, res.status);
	}
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

// --- 招待 ---

export type InviteState = 'active' | 'used' | 'expired' | 'revoked';

export interface AdminInvite {
	id: string;
	code: string;
	createdAt: number;
	expiresAt: number | null;
	usedAt: number | null;
	revokedAt: number | null;
	issuer: string | null;
	invitee: string | null;
	state: InviteState;
}

export function listInvites(): Promise<AdminInvite[]> {
	return api<AdminInvite[]>('/api/invites');
}

export function createInvite(
	expiresInHours: number | null
): Promise<{ code: string; expiresAt: number | null }> {
	return api('/api/invites', { method: 'POST', body: JSON.stringify({ expiresInHours }) });
}

export function revokeInvite(id: string): Promise<{ ok: true }> {
	return api(`/api/invites/${id}`, { method: 'PATCH' });
}

export function deleteInvite(id: string): Promise<void> {
	return api(`/api/invites/${id}`, { method: 'DELETE' });
}

// --- ユーザー ---

export interface AdminUser {
	id: string;
	username: string;
	role: Role;
	createdAt: number;
	/** 未使用で期限内のリセットリンクの期限。無ければ null。 */
	resetLinkExpiresAt: number | null;
}

export function listUsers(): Promise<AdminUser[]> {
	return api<AdminUser[]>('/api/users');
}

export function setUserRole(id: string, role: Role): Promise<{ ok: true }> {
	return api(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
}

export function deleteUser(id: string): Promise<{ ok: true; selfDeleted: boolean }> {
	return api(`/api/users/${id}`, { method: 'DELETE' });
}

export function resetUserPassword(id: string, newPassword: string): Promise<{ ok: true }> {
	return api(`/api/users/${id}/password`, {
		method: 'POST',
		body: JSON.stringify({ newPassword })
	});
}

/** リセットリンクを発行する。URL はこの応答でしか得られない。 */
export function issueResetLink(id: string): Promise<{ url: string; expiresAt: number }> {
	return api(`/api/users/${id}/reset-link`, { method: 'POST' });
}

export function revokeResetLink(id: string): Promise<{ ok: true }> {
	return api(`/api/users/${id}/reset-link`, { method: 'DELETE' });
}

// --- 自分のアカウント ---

/** パスワードを変更・設定する。currentPassword を省くと直近の本人確認が必要。 */
export function setOwnPassword(newPassword: string, currentPassword?: string): Promise<{ ok: true }> {
	return api('/api/account/password', {
		method: 'POST',
		body: JSON.stringify({ currentPassword, newPassword })
	});
}

export function removeOwnPassword(): Promise<{ ok: true }> {
	return api('/api/account/password', { method: 'DELETE' });
}

// --- パスキー ---

/** パスキーで認証し、その応答を返す(ログインと本人確認で共用)。 */
async function passkeyAssertion(useBrowserAutofill = false) {
	const optionsJSON = await api<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
		'/api/passkey/auth/options',
		{ method: 'POST' }
	);
	return startAuthentication({ optionsJSON, useBrowserAutofill });
}

/** パスキーでログインする。useBrowserAutofill ならユーザー名欄のオートフィルから選ばせる。 */
export async function loginWithPasskey(useBrowserAutofill = false): Promise<void> {
	const response = await passkeyAssertion(useBrowserAutofill);
	await api('/api/passkey/login', { method: 'POST', body: JSON.stringify({ response }) });
}

/**
 * パスキーを作って登録する。start が signup(ユーザー名+招待)なら会員登録、
 * resetToken ならリセットリンクでの再設定、省けばログイン中の会員への追加。
 */
async function registerPasskey(
	name: string,
	start: { username: string; invite: string } | { resetToken: string } | object = {}
) {
	const optionsJSON = await api<Parameters<typeof startRegistration>[0]['optionsJSON']>(
		'/api/passkey/register/options',
		{ method: 'POST', body: JSON.stringify(start) }
	);
	const response = await startRegistration({ optionsJSON });
	await api('/api/passkey/register/verify', {
		method: 'POST',
		body: JSON.stringify({ response, name })
	});
}

export function signupWithPasskey(username: string, invite: string): Promise<void> {
	return registerPasskey('', { username, invite });
}

export function addPasskey(name: string): Promise<void> {
	return registerPasskey(name);
}

/** リセットリンクでパスキーを登録し、そのままログインする。 */
export function resetWithPasskey(resetToken: string, name: string): Promise<void> {
	return registerPasskey(name, { resetToken });
}

export function renamePasskey(id: string, name: string): Promise<{ ok: true }> {
	return api(`/api/account/passkeys/${encodeURIComponent(id)}`, {
		method: 'PATCH',
		body: JSON.stringify({ name })
	});
}

export function deletePasskey(id: string): Promise<{ ok: true }> {
	return api(`/api/account/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** 本人確認(再認証)。パスワードを渡せばパスワードで、省けばパスキーで行う。 */
export async function reauthenticate(password?: string): Promise<void> {
	const body = password !== undefined ? { password } : { response: await passkeyAssertion() };
	await api('/api/account/reauth', { method: 'POST', body: JSON.stringify(body) });
}

/** ブラウザ操作(パスキー作成・選択)をユーザーが取り消したか。 */
export function isPasskeyCancel(err: unknown): boolean {
	return err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError');
}
