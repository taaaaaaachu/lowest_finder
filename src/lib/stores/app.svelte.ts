import type { Group, Item } from '$lib/types';
import type { GroupInput, ItemInput, Repository } from '$lib/repo/types';
import { sortItemsByUnitPrice } from '$lib/domain/unitPrice';

/**
 * 画面全体の状態を持つストア。どのリポジトリ(ゲスト/会員)で動くかを差し替えられる。
 * Svelte 5 の runes($state)で反応性を持たせる。
 */
export class AppStore {
	repo = $state<Repository | null>(null);
	groups = $state<Group[]>([]);
	selectedGroupId = $state<string | null>(null);
	items = $state<Item[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);
	/** サーバーに届かず、端末に保存したデータを表示している状態(会員モードのみ)。 */
	offline = $state(false);
	/** サーバーへ未送信の変更数(会員モードのみ)。 */
	pending = $state(0);
	/** セッション切れで未送信の変更を送れない状態(会員モードのみ)。 */
	authRequired = $state(false);

	/** 選択中グループ。 */
	get selectedGroup(): Group | null {
		return this.groups.find((g) => g.id === this.selectedGroupId) ?? null;
	}

	/** 選択中グループの商品を単価の安い順に並べたもの。 */
	get sortedItems(): Item[] {
		return sortItemsByUnitPrice(this.items);
	}

	/** リポジトリを差し替えて初期ロードする。 */
	async setRepository(repo: Repository): Promise<void> {
		this.repo = repo;
		this.selectedGroupId = null;
		this.items = [];
		await this.reloadGroups();
	}

	async reloadGroups(): Promise<void> {
		if (!this.repo) return;
		this.groups = await this.repo.listGroups();
		// 選択中グループが消えていたら選択解除。
		if (this.selectedGroupId && !this.groups.some((g) => g.id === this.selectedGroupId)) {
			this.selectedGroupId = null;
			this.items = [];
		}
	}

	/** 同期などでリポジトリの中身が変わったときに表示を取り直す。 */
	async refresh(): Promise<void> {
		await this.reloadGroups();
		await this.reloadItems();
	}

	async selectGroup(id: string): Promise<void> {
		if (!this.repo) return;
		this.selectedGroupId = id;
		this.items = await this.repo.listItems(id);
	}

	async reloadItems(): Promise<void> {
		if (!this.repo || !this.selectedGroupId) return;
		this.items = await this.repo.listItems(this.selectedGroupId);
	}

	async addGroup(input: GroupInput): Promise<void> {
		if (!this.repo) return;
		const g = await this.repo.createGroup(input);
		await this.reloadGroups();
		await this.selectGroup(g.id);
	}

	async updateGroup(id: string, patch: Partial<GroupInput>): Promise<void> {
		if (!this.repo) return;
		await this.repo.updateGroup(id, patch);
		await this.reloadGroups();
	}

	async deleteGroup(id: string): Promise<void> {
		if (!this.repo) return;
		await this.repo.deleteGroup(id);
		await this.reloadGroups();
	}

	async addItem(input: ItemInput): Promise<void> {
		if (!this.repo) return;
		await this.repo.createItem(input);
		await this.reloadItems();
	}

	async updateItem(id: string, patch: Partial<Omit<Item, 'id' | 'groupId'>>): Promise<void> {
		if (!this.repo) return;
		await this.repo.updateItem(id, patch);
		await this.reloadItems();
	}

	async deleteItem(id: string): Promise<void> {
		if (!this.repo) return;
		await this.repo.deleteItem(id);
		await this.reloadItems();
	}
}

/** アプリ全体で共有する単一のストアインスタンス。 */
export const app = new AppStore();
