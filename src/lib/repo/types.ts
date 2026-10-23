import type { Group, Item } from '#lib/types.js';

/** 新規グループ作成の入力(id はリポジトリ側で採番)。 */
export interface GroupInput {
	title: string;
	unitLabel: string;
}

/** 新規商品作成の入力(id・lastFetchedAt はリポジトリ側が管理)。 */
export interface ItemInput {
	groupId: string;
	name: string | null;
	volume: number;
	price: number;
	url: string | null;
}

/** グループ配下の商品をまとめたスナップショット。取り込み(Import)などで使う。 */
export interface Snapshot {
	groups: Group[];
	items: Item[];
}

/**
 * グループ/商品の永続化を担う抽象。
 * ゲストは IndexedDB 実装、会員はサーバー API 実装で同じ UI を動かす。
 */
export interface Repository {
	listGroups(): Promise<Group[]>;
	createGroup(input: GroupInput): Promise<Group>;
	updateGroup(id: string, patch: Partial<GroupInput>): Promise<Group>;
	/** グループを削除する。配下の商品もカスケード削除する。 */
	deleteGroup(id: string): Promise<void>;

	listItems(groupId: string): Promise<Item[]>;
	createItem(input: ItemInput): Promise<Item>;
	updateItem(
		id: string,
		patch: Partial<Omit<Item, 'id' | 'groupId'>>
	): Promise<Item>;
	deleteItem(id: string): Promise<void>;

	/** 全データのスナップショットを取り出す(取り込み元として使う)。 */
	exportAll(): Promise<Snapshot>;
}
