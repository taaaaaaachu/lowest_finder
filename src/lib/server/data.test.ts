import { describe, it, expect, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb, type Db } from './db';
import { users } from './db/schema';
import * as data from './data';

let db: Db;
const USER_A = 'user-a';
const USER_B = 'user-b';

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(users)
		.values([
			{ id: USER_A, username: 'a', passwordHash: 'x', createdAt: 0 },
			{ id: USER_B, username: 'b', passwordHash: 'x', createdAt: 0 }
		])
		.run();
});

describe('グループ CRUD', () => {
	it('作成・一覧・更新・削除ができる', () => {
		const g = data.createGroup(db, USER_A, { title: '洗剤', unitLabel: 'ml' })!;
		expect(data.listGroups(db, USER_A)).toHaveLength(1);

		const updated = data.updateGroup(db, USER_A, g.id, { title: '食器用洗剤' });
		expect(updated?.title).toBe('食器用洗剤');

		expect(data.deleteGroup(db, USER_A, g.id)).toBe(true);
		expect(data.listGroups(db, USER_A)).toHaveLength(0);
	});

	it('他人のグループは一覧に出ない', () => {
		data.createGroup(db, USER_A, { title: 'A の洗剤', unitLabel: 'ml' });
		expect(data.listGroups(db, USER_B)).toHaveLength(0);
	});

	it('他人のグループは更新・削除できない', () => {
		const g = data.createGroup(db, USER_A, { title: 'A の洗剤', unitLabel: 'ml' })!;
		expect(data.updateGroup(db, USER_B, g.id, { title: '乗っ取り' })).toBeNull();
		expect(data.deleteGroup(db, USER_B, g.id)).toBe(false);
		expect(data.listGroups(db, USER_A)).toHaveLength(1);
	});
});

describe('商品 CRUD と所有権', () => {
	it('作成・一覧・更新・削除ができる', () => {
		const g = data.createGroup(db, USER_A, { title: '洗剤', unitLabel: 'ml' })!;
		const item = data.createItem(db, USER_A, {
			groupId: g.id,
			name: '詰替',
			volume: 1380,
			price: 300,
			url: null
		});
		expect(item).not.toBeNull();
		expect(data.listItems(db, USER_A, g.id)).toHaveLength(1);

		const up = data.updateItem(db, USER_A, item!.id, { price: 280, lastFetchedAt: 111 });
		expect(up?.price).toBe(280);
		expect(up?.lastFetchedAt).toBe(111);

		expect(data.deleteItem(db, USER_A, item!.id)).toBe(true);
		expect(data.listItems(db, USER_A, g.id)).toHaveLength(0);
	});

	it('他人のグループには商品を作れない', () => {
		const g = data.createGroup(db, USER_A, { title: '洗剤', unitLabel: 'ml' })!;
		const item = data.createItem(db, USER_B, {
			groupId: g.id,
			name: 'x',
			volume: 100,
			price: 100,
			url: null
		});
		expect(item).toBeNull();
	});

	it('他人の商品は更新・削除できない', () => {
		const g = data.createGroup(db, USER_A, { title: '洗剤', unitLabel: 'ml' })!;
		const item = data.createItem(db, USER_A, {
			groupId: g.id,
			name: 'x',
			volume: 100,
			price: 100,
			url: null
		})!;
		expect(data.updateItem(db, USER_B, item.id, { price: 1 })).toBeNull();
		expect(data.deleteItem(db, USER_B, item.id)).toBe(false);
		expect(data.listItems(db, USER_A, g.id)![0].price).toBe(100);
	});

	it('他人のグループの商品一覧は取得できない(null)', () => {
		const g = data.createGroup(db, USER_A, { title: '洗剤', unitLabel: 'ml' })!;
		expect(data.listItems(db, USER_B, g.id)).toBeNull();
	});

	it('グループ削除で配下の商品もカスケード削除される', () => {
		const g = data.createGroup(db, USER_A, { title: '洗剤', unitLabel: 'ml' })!;
		data.createItem(db, USER_A, { groupId: g.id, name: 'a', volume: 100, price: 100, url: null });
		data.deleteGroup(db, USER_A, g.id);
		expect(data.exportAll(db, USER_A).items).toHaveLength(0);
	});
});

describe('取り込み(importSnapshot)', () => {
	it('スナップショットを新規idで追記し、グループ-商品の対応を保つ', () => {
		const snapshot = {
			groups: [{ id: 'old-g', title: '食器用洗剤', unitLabel: 'ml' }],
			items: [
				{ id: 'old-i1', groupId: 'old-g', name: '詰替', volume: 1380, price: 300, url: null, lastFetchedAt: null },
				{ id: 'old-i2', groupId: 'old-g', name: '本体', volume: 600, price: 200, url: null, lastFetchedAt: null }
			]
		};
		const res = data.importSnapshot(db, USER_A, snapshot);
		expect(res).toEqual({ groups: 1, items: 2 });

		const groups = data.listGroups(db, USER_A);
		expect(groups).toHaveLength(1);
		expect(groups[0].id).not.toBe('old-g'); // id は再採番
		const items = data.listItems(db, USER_A, groups[0].id)!;
		expect(items).toHaveLength(2);
	});

	it('親グループが無い孤児商品はスキップする', () => {
		const snapshot = {
			groups: [],
			items: [
				{ id: 'i', groupId: 'missing', name: 'x', volume: 100, price: 100, url: null, lastFetchedAt: null }
			]
		};
		const res = data.importSnapshot(db, USER_A, snapshot);
		expect(res).toEqual({ groups: 0, items: 0 });
	});

	it('単純追記なので既存データと同名でも別グループになる', () => {
		data.createGroup(db, USER_A, { title: '食器用洗剤', unitLabel: 'ml' });
		data.importSnapshot(db, USER_A, {
			groups: [{ id: 'g', title: '食器用洗剤', unitLabel: 'ml' }],
			items: []
		});
		expect(data.listGroups(db, USER_A)).toHaveLength(2);
	});
});

describe('クライアント採番 id での作成(オフライン再送の冪等性)', () => {
	it('指定した id で作成し、同じ id の再送は既存行を返して重複しない', () => {
		const g1 = data.createGroup(db, USER_A, { title: '洗剤', unitLabel: 'ml' }, 'g-1');
		const g2 = data.createGroup(db, USER_A, { title: '洗剤', unitLabel: 'ml' }, 'g-1');
		expect(g1?.id).toBe('g-1');
		expect(g2).toEqual(g1);
		expect(data.listGroups(db, USER_A)).toHaveLength(1);

		const input = {
			groupId: 'g-1',
			name: null,
			volume: 1,
			price: 1,
			url: null
		};
		const i1 = data.createItem(db, USER_A, input, 'i-1');
		const i2 = data.createItem(db, USER_A, input, 'i-1');
		expect(i1?.id).toBe('i-1');
		expect(i2).toEqual(i1);
		expect(data.listItems(db, USER_A, 'g-1')).toHaveLength(1);
	});

	it('他人の行と id が衝突したら null で、相手の行は変えない', () => {
		data.createGroup(db, USER_A, { title: 'A', unitLabel: 'ml' }, 'g-1');
		data.createItem(
			db,
			USER_A,
			{ groupId: 'g-1', name: 'A', volume: 1, price: 1, url: null },
			'i-1'
		);
		const gB = data.createGroup(db, USER_B, { title: 'B', unitLabel: 'g' }, 'g-b')!;

		expect(data.createGroup(db, USER_B, { title: 'B', unitLabel: 'g' }, 'g-1')).toBeNull();
		expect(
			data.createItem(
				db,
				USER_B,
				{ groupId: gB.id, name: 'B', volume: 1, price: 1, url: null },
				'i-1'
			)
		).toBeNull();
		expect(data.listGroups(db, USER_A)[0].title).toBe('A');
		expect(data.listItems(db, USER_A, 'g-1')?.[0].name).toBe('A');
	});
});
