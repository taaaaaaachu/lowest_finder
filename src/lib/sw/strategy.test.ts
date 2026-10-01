import { describe, expect, it } from 'vitest';
import { strategyFor } from './strategy';

const origin = 'https://lowest.example.com';
const precached = new Set(['/_app/immutable/app.js', '/offline.html']);
const req = (url: string, method = 'GET', mode = 'cors') => ({
	url: `${origin}${url}`,
	method,
	mode
});

describe('strategyFor', () => {
	it('プリキャッシュ対象はcache-first', () => {
		expect(strategyFor(req('/_app/immutable/app.js'), origin, precached)).toBe('precache');
		expect(strategyFor(req('/offline.html', 'GET', 'navigate'), origin, precached)).toBe(
			'precache'
		);
	});

	it('画面遷移と__data.jsonはnetwork-firstで保存する', () => {
		expect(strategyFor(req('/', 'GET', 'navigate'), origin, precached)).toBe('page');
		expect(strategyFor(req('/account', 'GET', 'navigate'), origin, precached)).toBe('page');
		expect(strategyFor(req('/__data.json?x-sveltekit-invalidated=1'), origin, precached)).toBe(
			'page'
		);
	});

	it('ログイン・登録のPOSTはページキャッシュを、ログアウトは会員データも消す', () => {
		expect(strategyFor(req('/login', 'POST'), origin, precached)).toBe('clear-pages');
		expect(strategyFor(req('/register', 'POST'), origin, precached)).toBe('clear-pages');
		expect(strategyFor(req('/logout', 'POST'), origin, precached)).toBe('logout');
	});

	it('APIと他オリジンと他メソッドには関与しない', () => {
		expect(strategyFor(req('/api/groups'), origin, precached)).toBe('network');
		expect(strategyFor(req('/api/groups', 'GET', 'navigate'), origin, precached)).toBe('network');
		expect(strategyFor(req('/api/items/1', 'PATCH'), origin, precached)).toBe('network');
		expect(strategyFor(req('/account', 'POST'), origin, precached)).toBe('network');
		expect(
			strategyFor(
				{ url: 'https://cdn.example.com/_app/immutable/app.js', method: 'GET', mode: 'cors' },
				origin,
				precached
			)
		).toBe('network');
	});
});
