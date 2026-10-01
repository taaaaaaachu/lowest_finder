import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { MemberRepository, type SyncStatus } from './member';
import type { Snapshot } from './types';

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

let sent: { method: string; url: string; body: unknown }[];
let server: Snapshot;
let handler: Handler;
let statuses: SyncStatus[];
let rejected: string[];

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 送信を記録し、/api/export には server の内容を返す既定のハンドラ。 */
const online: Handler = (url, init) => {
	if (url === '/api/export') return json(server);
	sent.push({ method: init!.method!, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
	return json({}, init!.method === 'DELETE' ? 204 : 200);
};
const offline: Handler = () => {
	throw new TypeError('Failed to fetch');
};

function repo() {
	return new MemberRepository('u1', {
		onSync: (s) => statuses.push(s),
		onRejected: (m) => rejected.push(m)
	});
}
const lastStatus = () => statuses.at(-1);

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	sent = [];
	server = { groups: [], items: [] };
	statuses = [];
	rejected = [];
	handler = online;
	vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
		Promise.resolve().then(() => handler(url, init))
	);
});

afterEach(() => vi.unstubAllGlobals());

describe('MemberRepository', () => {
	it('オフラインでも書き込みをローカルに反映し、未送信として保持する', async () => {
		handler = offline;
		const r = repo();
		const g = await r.createGroup({ title: '洗剤', unitLabel: 'ml' });
		await r.createItem({ groupId: g.id, name: '詰替', volume: 1380, price: 300, url: null });
		await r.sync();

		expect(await r.listGroups()).toEqual([g]);
		expect(await r.listItems(g.id)).toHaveLength(1);
		expect(lastStatus()).toEqual({ offline: true, authRequired: false, pending: 2 });
	});

	it('通信が戻ると outbox を順に再送し、サーバーの全件でローカルを置き換える', async () => {
		handler = offline;
		const r = repo();
		const g = await r.createGroup({ title: '洗剤', unitLabel: 'ml' });
		const item = await r.createItem({ groupId: g.id, name: null, volume: 1, price: 2, url: null });
		await r.updateItem(item.id, { price: 3 });
		await r.sync();

		handler = online;
		server = { groups: [{ ...g, title: 'サーバー側' }], items: [] };
		await r.sync();

		expect(sent).toEqual([
			{ method: 'POST', url: '/api/groups', body: g },
			{ method: 'POST', url: `/api/groups/${g.id}/items`, body: item },
			{ method: 'PATCH', url: `/api/items/${item.id}`, body: { price: 3 } }
		]);
		expect(await r.listGroups()).toEqual(server.groups);
		expect(await r.listItems(g.id)).toEqual([]);
		expect(lastStatus()).toEqual({ offline: false, authRequired: false, pending: 0 });
	});

	it('401 なら送信を止めて保持し、再ログインを促す', async () => {
		handler = () => json({ message: 'ログインが必要です。' }, 401);
		const r = repo();
		await r.createGroup({ title: '洗剤', unitLabel: 'ml' });
		await r.sync();
		expect(lastStatus()).toEqual({ offline: false, authRequired: true, pending: 1 });
	});

	it('5xx なら止めて後で再送し、未送信がある間はローカルを置き換えない', async () => {
		handler = () => json({}, 502);
		const r = repo();
		const g = await r.createGroup({ title: '洗剤', unitLabel: 'ml' });
		await r.sync();
		expect(lastStatus()).toEqual({ offline: true, authRequired: false, pending: 1 });
		expect(await r.listGroups()).toEqual([g]);
	});

	it('404(削除済み)は完了扱い、その他の 4xx は破棄して通知し、続きを送る', async () => {
		handler = offline;
		const r = repo();
		const g = await r.createGroup({ title: '洗剤', unitLabel: 'ml' });
		await r.updateGroup(g.id, { title: '' });
		await r.deleteGroup(g.id);
		await r.sync();

		handler = (url, init) => {
			if (init?.method === 'PATCH') return json({ message: 'タイトルは必須です。' }, 400);
			if (init?.method === 'DELETE') return json({}, 404);
			return online(url, init);
		};
		await r.sync();

		expect(rejected).toEqual(['タイトルは必須です。']);
		expect(sent.map((s) => s.method)).toEqual(['POST']);
		expect(lastStatus()?.pending).toBe(0);
	});

	it('グループ削除で配下の商品もローカルから消える', async () => {
		handler = offline;
		const r = repo();
		const g = await r.createGroup({ title: '洗剤', unitLabel: 'ml' });
		await r.createItem({ groupId: g.id, name: null, volume: 1, price: 1, url: null });
		await r.deleteGroup(g.id);
		expect(await r.exportAll()).toEqual({ groups: [], items: [] });
	});

	it('存在しない行の更新はローカルも outbox も変えずに失敗する', async () => {
		handler = offline;
		const r = repo();
		await expect(r.updateItem('missing', { price: 1 })).rejects.toThrow('商品が見つかりません');
		await r.sync();
		expect(lastStatus()?.pending).toBe(0);
	});
});
