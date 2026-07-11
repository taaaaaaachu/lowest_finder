import type { Group, Item } from '$lib/types';
import type { GroupInput, ItemInput, Repository, Snapshot } from './types';
import { ApiRepository } from './api';
import { OfflineCache } from './offlineCache';

/** ネットワーク起因の失敗(オフライン)かどうかを大まかに判定する。 */
function isNetworkError(e: unknown): boolean {
	return e instanceof TypeError; // fetch はオフライン時に TypeError を投げる
}

/**
 * 会員モードの L1 オフライン対応リポジトリ。
 * - 読み取り: オンライン時は API から取得しキャッシュへ保存。オフライン時はキャッシュを返す。
 * - 書き込み: 常に API 経由(オフラインなら失敗)。成功後にキャッシュも更新する。
 * オフライン状態になったら onOffline を呼ぶ。
 */
export class CachingApiRepository implements Repository {
	#api = new ApiRepository();
	#cache = new OfflineCache();
	#onOffline: (offline: boolean) => void;

	constructor(onOffline: (offline: boolean) => void = () => {}) {
		this.#onOffline = onOffline;
	}

	async listGroups(): Promise<Group[]> {
		try {
			const groups = await this.#api.listGroups();
			this.#onOffline(false);
			await this.#cache.saveGroups(groups);
			return groups;
		} catch (e) {
			if (isNetworkError(e)) {
				this.#onOffline(true);
				return this.#cache.loadGroups();
			}
			throw e;
		}
	}

	async listItems(groupId: string): Promise<Item[]> {
		try {
			const items = await this.#api.listItems(groupId);
			this.#onOffline(false);
			await this.#cache.saveItems(groupId, items);
			return items;
		} catch (e) {
			if (isNetworkError(e)) {
				this.#onOffline(true);
				return this.#cache.loadItems(groupId);
			}
			throw e;
		}
	}

	// --- 書き込みは API に委譲(オフラインなら例外が伝播) ---

	createGroup(input: GroupInput): Promise<Group> {
		return this.#api.createGroup(input);
	}

	updateGroup(id: string, patch: Partial<GroupInput>): Promise<Group> {
		return this.#api.updateGroup(id, patch);
	}

	deleteGroup(id: string): Promise<void> {
		return this.#api.deleteGroup(id);
	}

	createItem(input: ItemInput): Promise<Item> {
		return this.#api.createItem(input);
	}

	updateItem(id: string, patch: Partial<Omit<Item, 'id' | 'groupId'>>): Promise<Item> {
		return this.#api.updateItem(id, patch);
	}

	deleteItem(id: string): Promise<void> {
		return this.#api.deleteItem(id);
	}

	exportAll(): Promise<Snapshot> {
		return this.#api.exportAll();
	}

	importSnapshot(snapshot: Snapshot): Promise<{ groups: number; items: number }> {
		return this.#api.importSnapshot(snapshot);
	}

	clearCache(): Promise<void> {
		return this.#cache.clear();
	}
}
