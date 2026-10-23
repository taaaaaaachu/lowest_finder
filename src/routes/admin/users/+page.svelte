<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import {
		listUsers,
		setUserRole,
		deleteUser,
		resetUserPassword,
		type AdminUser
	} from '$lib/admin/client';
	import { canSetRole, canDeleteUser, canResetPassword, type Role } from '$lib/rbac';
	import { formatDateTime } from '$lib/format';

	let users = $state<AdminUser[]>([]);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	const me = $derived(page.data.user as { id: string; username: string; role: Role });

	const ROLE_LABEL: Record<Role, string> = {
		super_admin: 'スーパー管理者',
		admin: '管理者',
		user: '一般ユーザー'
	};
	const ALL_ROLES: Role[] = ['super_admin', 'admin', 'user'];

	onMount(reload);

	async function reload() {
		try {
			users = await listUsers();
		} catch (e) {
			error = e instanceof Error ? e.message : '一覧の取得に失敗しました。';
		}
	}

	/** me が u のロールを newRole に変えられるか(UI表示用。最終判定はサーバー)。 */
	function roleOptions(u: AdminUser): Role[] {
		return ALL_ROLES.filter((r) => r === u.role || canSetRole(me.role, u.role, r));
	}

	async function changeRole(u: AdminUser, newRole: Role) {
		if (newRole === u.role) return;
		error = null;
		try {
			await setUserRole(u.id, newRole);
			notice = `${u.username} を ${ROLE_LABEL[newRole]} にしました。`;
			// 自分のロールを変えたらヘッダー等の表示も更新する。
			if (u.id === me.id) await invalidate('app:user');
			await reload();
		} catch (e) {
			error = e instanceof Error ? e.message : 'ロール変更に失敗しました。';
			await reload();
		}
	}

	async function promote(u: AdminUser) {
		await changeRole(u, 'admin');
	}

	async function remove(u: AdminUser) {
		const self = u.id === me.id;
		const msg = self
			? '自分のアカウントを削除しますか?この操作は取り消せません。'
			: `${u.username} を削除しますか?この操作は取り消せません。`;
		if (!confirm(msg)) return;
		error = null;
		try {
			const res = await deleteUser(u.id);
			if (res.selfDeleted) {
				// 自分を消したらセッションも消えている。トップへ。
				await goto('/', { invalidateAll: true });
				return;
			}
			notice = `${u.username} を削除しました。`;
			await reload();
		} catch (e) {
			error = e instanceof Error ? e.message : '削除に失敗しました。';
		}
	}

	async function resetPassword(u: AdminUser) {
		const pw = prompt(`${u.username} の新しいパスワード(8文字以上)を入力
登録済みのパスキーはすべて削除されます。`);
		if (pw === null) return;
		error = null;
		try {
			await resetUserPassword(u.id, pw);
			notice = `${u.username} のパスワードを変更し、パスキーを削除しました(対象は再ログインが必要)。`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'パスワード変更に失敗しました。';
		}
	}
</script>

<svelte:head><title>ユーザー管理 — Lowest Finder</title></svelte:head>

<div class="page">
	<h1>ユーザー管理</h1>
	{#if error}<p class="err">{error}</p>{/if}
	{#if notice}<p class="notice">{notice}</p>{/if}

	<section class="card">
		<div class="table-wrap">
			<table>
				<thead>
					<tr><th>ユーザー名</th><th>ロール</th><th>登録日</th><th>操作</th></tr>
				</thead>
				<tbody>
					{#each users as u (u.id)}
						<tr>
							<td>
								{u.username}
								{#if u.id === me.id}<span class="you">(あなた)</span>{/if}
							</td>
							<td>
								{#if me.role === 'super_admin'}
									<select
										value={u.role}
										onchange={(e) => changeRole(u, e.currentTarget.value as Role)}
									>
										{#each roleOptions(u) as r (r)}
											<option value={r}>{ROLE_LABEL[r]}</option>
										{/each}
									</select>
								{:else}
									{ROLE_LABEL[u.role]}
								{/if}
							</td>
							<td>{formatDateTime(u.createdAt)}</td>
							<td class="ops">
								{#if me.role === 'admin' && canSetRole(me.role, u.role, 'admin')}
									<button type="button" onclick={() => promote(u)}>管理者にする</button>
								{/if}
								{#if canResetPassword(me.role, u.role)}
									<button type="button" onclick={() => resetPassword(u)}>パスワード</button>
								{/if}
								{#if canDeleteUser(me.role, u.role)}
									<button type="button" class="danger" onclick={() => remove(u)}>削除</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<p class="hint">
		※ スーパー管理者は常に1人以上必要です。最後のスーパー管理者の降格・削除はできません。
	</p>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	h1 {
		font-size: 1.3rem;
	}
	.card {
		padding: 0.5rem;
	}
	.err {
		color: var(--danger);
		font-size: 0.9rem;
		margin: 0;
	}
	.notice {
		color: var(--best);
		font-size: 0.9rem;
		margin: 0;
	}
	.hint {
		color: var(--muted);
		font-size: 0.8rem;
		margin: 0;
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}
	th {
		color: var(--muted);
		font-weight: 600;
	}
	.you {
		color: var(--primary);
		font-size: 0.78rem;
	}
	.ops {
		display: flex;
		gap: 0.35rem;
	}
	.ops button {
		font-size: 0.78rem;
		padding: 0.2rem 0.5rem;
	}
</style>
