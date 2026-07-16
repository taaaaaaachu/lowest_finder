import type { Role } from '$lib/rbac';

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
		throw new Error(message);
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

// --- 自分のアカウント ---

export function changeOwnPassword(
	currentPassword: string,
	newPassword: string
): Promise<{ ok: true }> {
	return api('/api/account/password', {
		method: 'POST',
		body: JSON.stringify({ currentPassword, newPassword })
	});
}
