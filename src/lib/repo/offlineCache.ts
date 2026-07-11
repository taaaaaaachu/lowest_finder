import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Group, Item } from '$lib/types';

const CACHE_DB = 'lowest-finder-cache';
const CACHE_VERSION = 1;

interface CacheDB extends DBSchema {
	groups: { key: string; value: Group };
	items: { key: string; value: Item; indexes: { by_group: string } };
}

/**
 * 会員データのオフライン閲覧用ローカルキャッシュ(L1)。
 * ゲスト用 IndexedDB とは別 DB として分離する。
 */
export class OfflineCache {
	#dbPromise: Promise<IDBPDatabase<CacheDB>>;

	constructor() {
		this.#dbPromise = openDB<CacheDB>(CACHE_DB, CACHE_VERSION, {
			upgrade(db) {
				db.createObjectStore('groups', { keyPath: 'id' });
				const items = db.createObjectStore('items', { keyPath: 'id' });
				items.createIndex('by_group', 'groupId');
			}
		});
	}

	async saveGroups(groups: Group[]): Promise<void> {
		const db = await this.#dbPromise;
		const tx = db.transaction('groups', 'readwrite');
		await tx.objectStore('groups').clear();
		for (const g of groups) await tx.objectStore('groups').put(g);
		await tx.done;
	}

	async loadGroups(): Promise<Group[]> {
		const db = await this.#dbPromise;
		return db.getAll('groups');
	}

	/** あるグループの商品キャッシュを丸ごと置き換える。 */
	async saveItems(groupId: string, items: Item[]): Promise<void> {
		const db = await this.#dbPromise;
		const tx = db.transaction('items', 'readwrite');
		const existing = await tx.objectStore('items').index('by_group').getAllKeys(groupId);
		for (const key of existing) await tx.objectStore('items').delete(key);
		for (const it of items) await tx.objectStore('items').put(it);
		await tx.done;
	}

	async loadItems(groupId: string): Promise<Item[]> {
		const db = await this.#dbPromise;
		return db.getAllFromIndex('items', 'by_group', groupId);
	}

	/** ログアウト時などにキャッシュを消す。 */
	async clear(): Promise<void> {
		const db = await this.#dbPromise;
		const tx = db.transaction(['groups', 'items'], 'readwrite');
		await tx.objectStore('groups').clear();
		await tx.objectStore('items').clear();
		await tx.done;
	}
}
