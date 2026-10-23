import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Group, Item } from '#lib/types.js';
import type { GroupInput, ItemInput, Repository, Snapshot } from './types';

const DB_NAME = 'lowest-finder';
const DB_VERSION = 1;

interface LowestFinderDB extends DBSchema {
	groups: {
		key: string;
		value: Group;
	};
	items: {
		key: string;
		value: Item;
		indexes: { by_group: string };
	};
}

function newId(): string {
	return crypto.randomUUID();
}

/**
 * ゲストモード用リポジトリ。データはブラウザの IndexedDB にのみ保存し、
 * サーバーとは一切通信しない(完全クライアント完結)。
 */
export class IndexedDbRepository implements Repository {
	#dbPromise: Promise<IDBPDatabase<LowestFinderDB>>;

	constructor() {
		this.#dbPromise = openDB<LowestFinderDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				db.createObjectStore('groups', { keyPath: 'id' });
				const items = db.createObjectStore('items', { keyPath: 'id' });
				items.createIndex('by_group', 'groupId');
			}
		});
	}

	async listGroups(): Promise<Group[]> {
		const db = await this.#dbPromise;
		return db.getAll('groups');
	}

	async createGroup(input: GroupInput): Promise<Group> {
		const db = await this.#dbPromise;
		const group: Group = { id: newId(), title: input.title, unitLabel: input.unitLabel };
		await db.put('groups', group);
		return group;
	}

	async updateGroup(id: string, patch: Partial<GroupInput>): Promise<Group> {
		const db = await this.#dbPromise;
		const existing = await db.get('groups', id);
		if (!existing) throw new Error(`グループが見つかりません: ${id}`);
		const updated: Group = { ...existing, ...patch };
		await db.put('groups', updated);
		return updated;
	}

	async deleteGroup(id: string): Promise<void> {
		const db = await this.#dbPromise;
		const tx = db.transaction(['groups', 'items'], 'readwrite');
		await tx.objectStore('groups').delete(id);
		const itemKeys = await tx.objectStore('items').index('by_group').getAllKeys(id);
		for (const key of itemKeys) {
			await tx.objectStore('items').delete(key);
		}
		await tx.done;
	}

	async listItems(groupId: string): Promise<Item[]> {
		const db = await this.#dbPromise;
		return db.getAllFromIndex('items', 'by_group', groupId);
	}

	async createItem(input: ItemInput): Promise<Item> {
		const db = await this.#dbPromise;
		const item: Item = {
			id: newId(),
			groupId: input.groupId,
			name: input.name,
			volume: input.volume,
			price: input.price,
			url: input.url,
			lastFetchedAt: null
		};
		await db.put('items', item);
		return item;
	}

	async updateItem(
		id: string,
		patch: Partial<Omit<Item, 'id' | 'groupId'>>
	): Promise<Item> {
		const db = await this.#dbPromise;
		const existing = await db.get('items', id);
		if (!existing) throw new Error(`商品が見つかりません: ${id}`);
		const updated: Item = { ...existing, ...patch };
		await db.put('items', updated);
		return updated;
	}

	async deleteItem(id: string): Promise<void> {
		const db = await this.#dbPromise;
		await db.delete('items', id);
	}

	async exportAll(): Promise<Snapshot> {
		const db = await this.#dbPromise;
		const [groups, items] = await Promise.all([db.getAll('groups'), db.getAll('items')]);
		return { groups, items };
	}

	/** ゲストデータを全消去する(会員データへ取り込んだ後などに使う)。 */
	async clearAll(): Promise<void> {
		const db = await this.#dbPromise;
		const tx = db.transaction(['groups', 'items'], 'readwrite');
		await tx.objectStore('groups').clear();
		await tx.objectStore('items').clear();
		await tx.done;
	}
}
