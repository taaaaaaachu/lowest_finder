import { describe, it, expect } from 'vitest';
import { isPrivateIp, assertPublicUrl, SsrfError } from './ssrf';

describe('isPrivateIp', () => {
	it('IPv4 のプライベート/ループバック等を拒否', () => {
		for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.0.1', '169.254.1.1', '0.0.0.0', '100.64.0.1']) {
			expect(isPrivateIp(ip), ip).toBe(true);
		}
	});
	it('公開 IPv4 は許可', () => {
		for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34']) {
			expect(isPrivateIp(ip), ip).toBe(false);
		}
	});
	it('IPv6 のループバック/リンクローカル/ULA を拒否', () => {
		for (const ip of ['::1', 'fe80::1', 'fd00::1', 'fc00::1', '::ffff:127.0.0.1']) {
			expect(isPrivateIp(ip), ip).toBe(true);
		}
	});
	it('公開 IPv6 は許可', () => {
		expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
	});
});

describe('assertPublicUrl', () => {
	it('http は拒否', async () => {
		await expect(assertPublicUrl('http://example.com')).rejects.toBeInstanceOf(SsrfError);
	});
	it('プライベート IP リテラルは拒否', async () => {
		await expect(assertPublicUrl('https://192.168.0.1/x')).rejects.toBeInstanceOf(SsrfError);
		await expect(assertPublicUrl('https://127.0.0.1/x')).rejects.toBeInstanceOf(SsrfError);
	});
	it('不正な URL は拒否', async () => {
		await expect(assertPublicUrl('not a url')).rejects.toBeInstanceOf(SsrfError);
	});
	it('公開 IP リテラルは許可', async () => {
		const url = await assertPublicUrl('https://8.8.8.8/');
		expect(url.hostname).toBe('8.8.8.8');
	});
});
