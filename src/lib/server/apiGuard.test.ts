import { describe, expect, it } from 'vitest';
import { allowedWithTemporaryPassword, clientId, requireRecentAuth } from './apiGuard';

describe('clientId', () => {
	it('未指定は undefined、UUID 等はそのまま返す', () => {
		expect(clientId({})).toBeUndefined();
		expect(clientId(null)).toBeUndefined();
		expect(clientId({ id: '0b6f2c1e-8a1d-4c3e-9f00-1234567890ab' })).toBe(
			'0b6f2c1e-8a1d-4c3e-9f00-1234567890ab'
		);
	});

	it('文字列以外・空・記号入り・長すぎる id は 400', () => {
		for (const id of [1, '', '../x', 'a b', 'x'.repeat(65)]) {
			expect(() => clientId({ id })).toThrow(expect.objectContaining({ status: 400 }));
		}
	});
});

describe('requireRecentAuth', () => {
	const user = { id: 'u', username: 'u', role: 'user' as const, passwordTemporary: false };

	it('直近に本人確認していれば、ユーザーとセッション id を返す', () => {
		const locals = { user, session: { id: 's', verifiedAt: Date.now() } };
		expect(requireRecentAuth(locals)).toEqual({ ...user, sessionId: 's' });
	});

	it('本人確認が古い・未確認なら 428、未ログインなら 401', () => {
		const stale = { user, session: { id: 's', verifiedAt: Date.now() - 60 * 60 * 1000 } };
		expect(() => requireRecentAuth(stale)).toThrow(expect.objectContaining({ status: 428 }));
		expect(() => requireRecentAuth({ user, session: { id: 's', verifiedAt: null } })).toThrow(
			expect.objectContaining({ status: 428 })
		);
		expect(() => requireRecentAuth({ user: null, session: null })).toThrow(
			expect.objectContaining({ status: 401 })
		);
	});
});

describe('allowedWithTemporaryPassword', () => {
	it('パスワード変更・パスキー登録と本人確認だけ許す', () => {
		for (const p of [
			'/api/account/password',
			'/api/account/reauth',
			'/api/passkey/auth/options',
			'/api/passkey/register/options',
			'/api/passkey/register/verify'
		]) {
			expect(allowedWithTemporaryPassword(p)).toBe(true);
		}
		for (const p of ['/api/groups', '/api/users', '/api/account/passkeys/x', '/api/scrape']) {
			expect(allowedWithTemporaryPassword(p)).toBe(false);
		}
	});
});
