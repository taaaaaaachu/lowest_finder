import 'fake-indexeddb/auto';
import { beforeEach, describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbRepository } from './indexeddb';

// 各テストごとに IndexedDB を初期化する。
beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});

describe('IndexedDbRepository', () => {
	it('グループを作成して一覧に現れる', async () => {
		const repo = new IndexedDbRepository();
		const g = await repo.createGroup({ title: '食器用洗剤', unitLabel: 'ml' });
		expect(g.id).toBeTruthy();
		const groups = await repo.listGroups();
		expect(groups).toHaveLength(1);
		expect(groups[0].title).toBe('食器用洗剤');
	});

	it('商品を作成しグループで絞り込める', async () => {
		const repo = new IndexedDbRepository();
		const g = await repo.createGroup({ title: '洗剤', unitLabel: 'ml' });
		const other = await repo.createGroup({ title: 'シャンプー', unitLabel: 'ml' });
		await repo.createItem({ groupId: g.id, name: '詰替', volume: 1380, price: 300, url: null });
		await repo.createItem({ groupId: g.id, name: '本体', volume: 600, price: 200, url: null });
		await repo.createItem({ groupId: other.id, name: null, volume: 400, price: 500, url: null });

		const items = await repo.listItems(g.id);
		expect(items).toHaveLength(2);
		expect(items.map((i) => i.name).sort()).toEqual(['本体', '詰替']);
	});

	it('商品の価格を更新できる', async () => {
		const repo = new IndexedDbRepository();
		const g = await repo.createGroup({ title: '洗剤', unitLabel: 'ml' });
		const item = await repo.createItem({
			groupId: g.id,
			name: null,
			volume: 600,
			price: 200,
			url: 'https://example.com/x'
		});
		const updated = await repo.updateItem(item.id, { price: 180, lastFetchedAt: 1234 });
		expect(updated.price).toBe(180);
		expect(updated.lastFetchedAt).toBe(1234);
		expect(updated.volume).toBe(600); // 他項目は保持
	});

	it('グループ削除で配下の商品もカスケード削除される', async () => {
		const repo = new IndexedDbRepository();
		const g = await repo.createGroup({ title: '洗剤', unitLabel: 'ml' });
		await repo.createItem({ groupId: g.id, name: 'a', volume: 100, price: 100, url: null });
		await repo.createItem({ groupId: g.id, name: 'b', volume: 200, price: 100, url: null });

		await repo.deleteGroup(g.id);

		expect(await repo.listGroups()).toHaveLength(0);
		const snapshot = await repo.exportAll();
		expect(snapshot.items).toHaveLength(0);
	});

	it('exportAll で全データのスナップショットを取り出せる', async () => {
		const repo = new IndexedDbRepository();
		const g = await repo.createGroup({ title: '洗剤', unitLabel: 'ml' });
		await repo.createItem({ groupId: g.id, name: 'a', volume: 100, price: 100, url: null });

		const snapshot = await repo.exportAll();
		expect(snapshot.groups).toHaveLength(1);
		expect(snapshot.items).toHaveLength(1);
	});

	it('clearAll で全消去できる', async () => {
		const repo = new IndexedDbRepository();
		const g = await repo.createGroup({ title: '洗剤', unitLabel: 'ml' });
		await repo.createItem({ groupId: g.id, name: 'a', volume: 100, price: 100, url: null });

		await repo.clearAll();

		expect(await repo.listGroups()).toHaveLength(0);
		expect((await repo.exportAll()).items).toHaveLength(0);
	});
});
