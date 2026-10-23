import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';
import type { Group, Item } from '#lib/types.js';
import type { GroupInput, ItemInput, Repository, Snapshot } from './types';
import { req } from './api';

/** 会員のローカルDB名の接頭辞。ログアウト時に Service Worker がまとめて消す。 */
export const MEMBER_DB_PREFIX = 'lowest-finder-m-';

/** サーバーへ未送信の書き込み。既存APIへそのまま再送する。 */
interface Op {
	method: 'POST' | 'PATCH' | 'DELETE';
	url: string;
	body?: unknown;
}

interface MemberDB extends DBSchema {
	groups: { key: string; value: Group };
	items: { key: string; value: Item; indexes: { by_group: string } };
	outbox: { key: number; value: Op };
}

export interface SyncStatus {
	/** サーバーに届かない(最終同期データを表示中)。 */
	offline: boolean;
	/** 未送信の変更数。 */
	pending: number;
	/** セッション切れ等で送信できない。再ログインが必要。 */
	authRequired: boolean;
}

export interface MemberCallbacks {
	/** 同期を1回終えるたびに呼ぶ。ローカルDBが変わった可能性がある。 */
	onSync?: (status: SyncStatus) => void;
	/** サーバーに拒否されて破棄した変更があった。 */
	onRejected?: (message: string) => void;
}

type SendResult = 'done' | 'rejected' | 'retry' | 'auth';
type WriteTx = IDBPTransaction<MemberDB, ('groups' | 'items' | 'outbox')[], 'readwrite'>;

function classify(status: number): SendResult {
	if ((status >= 200 && status < 300) || status === 404) return 'done'; // 404: 削除済み(削除優先)
	if (status === 401 || status === 403) return 'auth';
	if (status === 408 || status === 429 || status >= 500) return 'retry';
	return 'rejected';
}

/**
 * 会員モードのリポジトリ。読み書きはユーザーごとのローカルDBに対して行い、
 * 書き込みは outbox に積んでサーバーへ順に再送する(オフラインでも記録できる)。
 * 同期は「outbox を順に送信 → 空になったらサーバーの全件でローカルを置き換え」。
 * 競合はサーバーへ届いた順の後勝ち、削除済みへの変更は破棄(削除優先)。
 */
export class MemberRepository implements Repository {
	#db: Promise<IDBPDatabase<MemberDB>>;
	#cb: MemberCallbacks;
	#running: Promise<void> | null = null;
	#again = false;

	constructor(userId: string, callbacks: MemberCallbacks = {}) {
		this.#cb = callbacks;
		this.#db = openDB<MemberDB>(`${MEMBER_DB_PREFIX}${userId}`, 1, {
			upgrade(db) {
				db.createObjectStore('groups', { keyPath: 'id' });
				const items = db.createObjectStore('items', { keyPath: 'id' });
				items.createIndex('by_group', 'groupId');
				db.createObjectStore('outbox', { autoIncrement: true });
			},
			// ログアウト時の削除(deleteDatabase)を妨げないよう、要求されたら閉じる。
			blocking(_current, _next, event) {
				(event.target as IDBDatabase).close();
			}
		});
	}

	// --- 読み取り(ローカル) ---

	async listGroups(): Promise<Group[]> {
		return (await this.#db).getAll('groups');
	}

	async listItems(groupId: string): Promise<Item[]> {
		return (await this.#db).getAllFromIndex('items', 'by_group', groupId);
	}

	async exportAll(): Promise<Snapshot> {
		const db = await this.#db;
		return { groups: await db.getAll('groups'), items: await db.getAll('items') };
	}

	// --- 書き込み(ローカルへ反映して outbox に積む) ---

	async createGroup(input: GroupInput): Promise<Group> {
		const group: Group = { id: crypto.randomUUID(), ...input };
		await this.#write(['groups'], (tx) => tx.objectStore('groups').put(group), {
			method: 'POST',
			url: '/api/groups',
			body: group
		});
		return group;
	}

	async updateGroup(id: string, patch: Partial<GroupInput>): Promise<Group> {
		let updated!: Group;
		await this.#write(
			['groups'],
			async (tx) => {
				const existing = await tx.objectStore('groups').get(id);
				if (!existing) throw new Error('グループが見つかりません。');
				updated = { ...existing, ...patch };
				await tx.objectStore('groups').put(updated);
			},
			{ method: 'PATCH', url: `/api/groups/${id}`, body: patch }
		);
		return updated;
	}

	async deleteGroup(id: string): Promise<void> {
		await this.#write(
			['groups', 'items'],
			async (tx) => {
				const items = tx.objectStore('items');
				for (const key of await items.index('by_group').getAllKeys(id)) await items.delete(key);
				await tx.objectStore('groups').delete(id);
			},
			{ method: 'DELETE', url: `/api/groups/${id}` }
		);
	}

	async createItem(input: ItemInput): Promise<Item> {
		const item: Item = { id: crypto.randomUUID(), ...input, lastFetchedAt: null };
		await this.#write(['items'], (tx) => tx.objectStore('items').put(item), {
			method: 'POST',
			url: `/api/groups/${input.groupId}/items`,
			body: item
		});
		return item;
	}

	async updateItem(id: string, patch: Partial<Omit<Item, 'id' | 'groupId'>>): Promise<Item> {
		let updated!: Item;
		await this.#write(
			['items'],
			async (tx) => {
				const existing = await tx.objectStore('items').get(id);
				if (!existing) throw new Error('商品が見つかりません。');
				updated = { ...existing, ...patch };
				await tx.objectStore('items').put(updated);
			},
			{ method: 'PATCH', url: `/api/items/${id}`, body: patch }
		);
		return updated;
	}

	async deleteItem(id: string): Promise<void> {
		await this.#write(['items'], (tx) => tx.objectStore('items').delete(id), {
			method: 'DELETE',
			url: `/api/items/${id}`
		});
	}

	/** ゲストのスナップショットをサーバーへ取り込む(オンライン限定)。 */
	async importSnapshot(snapshot: Snapshot): Promise<{ groups: number; items: number }> {
		const result = await req<{ groups: number; items: number }>('/api/import', {
			method: 'POST',
			body: JSON.stringify(snapshot)
		});
		await this.sync();
		return result;
	}

	/** ローカルの変更と outbox への追加を1トランザクションで行い、同期を始める。 */
	async #write(
		stores: ('groups' | 'items')[],
		apply: (tx: WriteTx) => Promise<unknown> | unknown,
		op: Op
	): Promise<void> {
		const db = await this.#db;
		const tx = db.transaction([...stores, 'outbox'], 'readwrite');
		try {
			await apply(tx);
			await tx.objectStore('outbox').add(op);
			await tx.done;
		} catch (e) {
			tx.done.catch(() => {}); // abort による reject は想定内
			tx.abort();
			throw e;
		}
		this.sync().catch((e) => console.error('同期に失敗しました', e));
	}

	// --- 同期 ---

	/** 同期する。実行中に呼ばれたら、終わったあともう一度回す。 */
	sync(): Promise<void> {
		if (this.#running) {
			this.#again = true;
			return this.#running;
		}
		this.#running = (async () => {
			do {
				this.#again = false;
				await this.#syncOnce();
			} while (this.#again);
		})().finally(() => (this.#running = null));
		return this.#running;
	}

	async #syncOnce(): Promise<void> {
		const db = await this.#db;
		let stopped: 'retry' | 'auth' | null = null;

		for (;;) {
			const cursor = await db.transaction('outbox').store.openCursor();
			if (!cursor) break;
			const { key, value: op } = cursor;
			const [result, message] = await this.#send(op);
			if (result === 'retry' || result === 'auth') {
				stopped = result;
				break;
			}
			if (result === 'rejected') this.#cb.onRejected?.(message);
			await db.delete('outbox', key);
		}

		if (!stopped) {
			try {
				const res = await fetch('/api/export');
				const result = classify(res.status);
				if (res.ok) await this.#replaceAll((await res.json()) as Snapshot);
				else if (result === 'auth' || result === 'retry') stopped = result;
			} catch {
				stopped = 'retry';
			}
		}

		this.#cb.onSync?.({
			offline: stopped === 'retry',
			authRequired: stopped === 'auth',
			pending: await db.count('outbox')
		});
	}

	/** 1件送信する。拒否されたときはサーバーのメッセージも返す。 */
	async #send(op: Op): Promise<[SendResult, string]> {
		try {
			const res = await fetch(op.url, {
				method: op.method,
				headers: { 'content-type': 'application/json' },
				body: op.body === undefined ? undefined : JSON.stringify(op.body)
			});
			const result = classify(res.status);
			if (result !== 'rejected') return [result, ''];
			const body = await res.json().catch(() => null);
			return [result, body?.message ?? `リクエストに失敗しました (${res.status})`];
		} catch {
			return ['retry', '']; // 通信不可
		}
	}

	/** サーバーの全件でローカルを置き換える。未送信の変更があるときは置き換えない。 */
	async #replaceAll(snapshot: Snapshot): Promise<void> {
		const db = await this.#db;
		const tx = db.transaction(['groups', 'items', 'outbox'], 'readwrite');
		if ((await tx.objectStore('outbox').count()) > 0) {
			this.#again = true; // 取得中に書き込みがあった。送信してから取り直す。
			await tx.done;
			return;
		}
		await tx.objectStore('groups').clear();
		await tx.objectStore('items').clear();
		for (const g of snapshot.groups) await tx.objectStore('groups').put(g);
		for (const i of snapshot.items) await tx.objectStore('items').put(i);
		await tx.done;
	}
}
