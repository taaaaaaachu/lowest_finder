import type { Group, Item } from '$lib/types';
import type { GroupInput, ItemInput, Repository, Snapshot } from './types';

async function req<T>(input: string, init?: RequestInit): Promise<T> {
	const res = await fetch(input, {
		...init,
		headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
	});
	if (!res.ok) {
		let message = `リクエストに失敗しました (${res.status})`;
		try {
			const body = await res.json();
			if (body?.message) message = body.message;
		} catch {
			/* JSON でないレスポンスはそのまま既定メッセージ */
		}
		throw new Error(message);
	}
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

/**
 * 会員モード用リポジトリ。サーバーの /api エンドポイント経由で
 * DB に永続化する。オフライン時は fetch が失敗して例外になる。
 */
export class ApiRepository implements Repository {
	listGroups(): Promise<Group[]> {
		return req<Group[]>('/api/groups');
	}

	createGroup(input: GroupInput): Promise<Group> {
		return req<Group>('/api/groups', { method: 'POST', body: JSON.stringify(input) });
	}

	updateGroup(id: string, patch: Partial<GroupInput>): Promise<Group> {
		return req<Group>(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
	}

	deleteGroup(id: string): Promise<void> {
		return req<void>(`/api/groups/${id}`, { method: 'DELETE' });
	}

	listItems(groupId: string): Promise<Item[]> {
		return req<Item[]>(`/api/groups/${groupId}/items`);
	}

	createItem(input: ItemInput): Promise<Item> {
		return req<Item>(`/api/groups/${input.groupId}/items`, {
			method: 'POST',
			body: JSON.stringify(input)
		});
	}

	updateItem(id: string, patch: Partial<Omit<Item, 'id' | 'groupId'>>): Promise<Item> {
		return req<Item>(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
	}

	deleteItem(id: string): Promise<void> {
		return req<void>(`/api/items/${id}`, { method: 'DELETE' });
	}

	exportAll(): Promise<Snapshot> {
		// 会員データのエクスポートは現状 UI から使わないため未実装。
		throw new Error('未実装');
	}

	/** ゲストのスナップショットをサーバーへ取り込む。 */
	importSnapshot(snapshot: Snapshot): Promise<{ groups: number; items: number }> {
		return req('/api/import', { method: 'POST', body: JSON.stringify(snapshot) });
	}
}
