import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Db } from './db';
import { groups, items } from './db/schema';
import type { Group, Item } from '$lib/types';
import type { GroupInput, ItemInput, Snapshot } from '$lib/repo/types';

function newId(): string {
	return randomBytes(16).toString('hex');
}

// --- 行 → ドメイン型 の変換(会員データからは userId を落として返す) ---

function toGroup(row: typeof groups.$inferSelect): Group {
	return { id: row.id, title: row.title, unitLabel: row.unitLabel };
}

function toItem(row: typeof items.$inferSelect): Item {
	return {
		id: row.id,
		groupId: row.groupId,
		name: row.name,
		volume: row.volume,
		price: row.price,
		url: row.url,
		lastFetchedAt: row.lastFetchedAt
	};
}

// --- グループ ---

export function listGroups(db: Db, userId: string): Group[] {
	return db.select().from(groups).where(eq(groups.userId, userId)).all().map(toGroup);
}

export function createGroup(db: Db, userId: string, input: GroupInput): Group {
	const row = { id: newId(), userId, title: input.title, unitLabel: input.unitLabel };
	db.insert(groups).values(row).run();
	return toGroup(row);
}

/** ユーザー所有のグループのみ更新する。所有でなければ null。 */
export function updateGroup(
	db: Db,
	userId: string,
	id: string,
	patch: Partial<GroupInput>
): Group | null {
	const existing = db
		.select()
		.from(groups)
		.where(and(eq(groups.id, id), eq(groups.userId, userId)))
		.get();
	if (!existing) return null;
	const updated = { ...existing, ...patch };
	db.update(groups).set(updated).where(eq(groups.id, id)).run();
	return toGroup(updated);
}

/** ユーザー所有のグループを削除する(FK の onDelete cascade で商品も消える)。 */
export function deleteGroup(db: Db, userId: string, id: string): boolean {
	const res = db
		.delete(groups)
		.where(and(eq(groups.id, id), eq(groups.userId, userId)))
		.run();
	return res.changes > 0;
}

// --- 商品 ---

/** グループがユーザー所有かを確認する。 */
function ownsGroup(db: Db, userId: string, groupId: string): boolean {
	return !!db
		.select({ id: groups.id })
		.from(groups)
		.where(and(eq(groups.id, groupId), eq(groups.userId, userId)))
		.get();
}

/** 商品がユーザー所有か(所属グループ経由)を確認しつつ行を返す。 */
function findOwnedItem(db: Db, userId: string, itemId: string) {
	const row = db
		.select({ item: items, ownerId: groups.userId })
		.from(items)
		.innerJoin(groups, eq(items.groupId, groups.id))
		.where(eq(items.id, itemId))
		.get();
	if (!row || row.ownerId !== userId) return null;
	return row.item;
}

export function listItems(db: Db, userId: string, groupId: string): Item[] | null {
	if (!ownsGroup(db, userId, groupId)) return null;
	return db.select().from(items).where(eq(items.groupId, groupId)).all().map(toItem);
}

export function createItem(db: Db, userId: string, input: ItemInput): Item | null {
	if (!ownsGroup(db, userId, input.groupId)) return null;
	const row = {
		id: newId(),
		groupId: input.groupId,
		name: input.name,
		volume: input.volume,
		price: input.price,
		url: input.url,
		lastFetchedAt: null
	};
	db.insert(items).values(row).run();
	return toItem(row);
}

export function updateItem(
	db: Db,
	userId: string,
	id: string,
	patch: Partial<Omit<Item, 'id' | 'groupId'>>
): Item | null {
	const existing = findOwnedItem(db, userId, id);
	if (!existing) return null;
	const updated = { ...existing, ...patch };
	db.update(items).set(updated).where(eq(items.id, id)).run();
	return toItem(updated);
}

export function deleteItem(db: Db, userId: string, id: string): boolean {
	const existing = findOwnedItem(db, userId, id);
	if (!existing) return false;
	db.delete(items).where(eq(items.id, id)).run();
	return true;
}

export function exportAll(db: Db, userId: string): Snapshot {
	const gs = listGroups(db, userId);
	const groupIds = new Set(gs.map((g) => g.id));
	const allItems = db
		.select()
		.from(items)
		.innerJoin(groups, eq(items.groupId, groups.id))
		.where(eq(groups.userId, userId))
		.all()
		.map((r) => toItem(r.items));
	return { groups: gs, items: allItems.filter((i) => groupIds.has(i.groupId)) };
}

/**
 * ゲストデータのスナップショットを会員データへ取り込む(単純追記)。
 * id は全て新規採番し、グループ→商品の対応を維持する。マージはしない。
 * 取り込んだグループ数・商品数を返す。
 */
export function importSnapshot(
	db: Db,
	userId: string,
	snapshot: Snapshot
): { groups: number; items: number } {
	let groupCount = 0;
	let itemCount = 0;
	// 旧グループid → 新グループid の対応表。
	const idMap = new Map<string, string>();

	db.transaction((tx) => {
		for (const g of snapshot.groups) {
			const newGroupId = newId();
			idMap.set(g.id, newGroupId);
			tx.insert(groups)
				.values({ id: newGroupId, userId, title: g.title, unitLabel: g.unitLabel ?? '' })
				.run();
			groupCount++;
		}
		for (const it of snapshot.items) {
			const newGroupId = idMap.get(it.groupId);
			if (!newGroupId) continue; // 親グループが取り込み対象に無ければスキップ。
			tx.insert(items)
				.values({
					id: newId(),
					groupId: newGroupId,
					name: it.name ?? null,
					volume: it.volume,
					price: it.price,
					url: it.url ?? null,
					lastFetchedAt: it.lastFetchedAt ?? null
				})
				.run();
			itemCount++;
		}
	});

	return { groups: groupCount, items: itemCount };
}
