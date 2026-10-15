import { describe, it, expect } from 'vitest';
import { hash, verify } from '@node-rs/argon2';
import { validateUsername, validatePassword, isRecentlyVerified, RECENT_AUTH_MS } from './auth';

describe('validateUsername', () => {
	it('3〜32文字の英数字と _ . - を許可', () => {
		expect(validateUsername('yt_user.1-2')).toBeNull();
	});
	it('短すぎると弾く', () => {
		expect(validateUsername('ab')).not.toBeNull();
	});
	it('長すぎると弾く', () => {
		expect(validateUsername('a'.repeat(33))).not.toBeNull();
	});
	it('記号や空白を弾く', () => {
		expect(validateUsername('ho ge')).not.toBeNull();
		expect(validateUsername('ho@ge')).not.toBeNull();
	});
	it('前後空白はトリムして判定', () => {
		expect(validateUsername('  yamada  ')).toBeNull();
	});
});

describe('validatePassword', () => {
	it('8文字以上を許可', () => {
		expect(validatePassword('password1')).toBeNull();
	});
	it('7文字以下を弾く', () => {
		expect(validatePassword('short12')).not.toBeNull();
	});
});

describe('argon2 ハッシュ', () => {
	it('正しいパスワードは検証に通り、誤りは通らない', async () => {
		const h = await hash('correct horse battery', {
			memoryCost: 19456,
			timeCost: 2,
			parallelism: 1
		});
		expect(await verify(h, 'correct horse battery')).toBe(true);
		expect(await verify(h, 'wrong password')).toBe(false);
	});
});

describe('isRecentlyVerified', () => {
	it('猶予内なら true、猶予切れ・未確認なら false', () => {
		const now = 1_000_000_000;
		expect(isRecentlyVerified(now - RECENT_AUTH_MS + 1, now)).toBe(true);
		expect(isRecentlyVerified(now - RECENT_AUTH_MS, now)).toBe(false);
		expect(isRecentlyVerified(null, now)).toBe(false);
	});
});
