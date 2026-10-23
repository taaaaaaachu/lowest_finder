<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import {
		listUsers,
		setUserRole,
		deleteUser,
		resetUserPassword,
		issueResetLink,
		revokeResetLink,
		type AdminUser
	} from '$lib/admin/client';
	import { canSetRole, canDeleteUser, canResetPassword, type Role } from '$lib/rbac';
	import { formatDateTime } from '$lib/format';

	let users = $state<AdminUser[]>([]);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	/** 発行直後のリセットリンク。URL はこのときしか見られない。 */
	let issued = $state<{ username: string; url: string } | null>(null);
	let copied = $state(false);

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
		const pw = prompt(`${u.username} の仮パスワード(8文字以上)を入力
登録済みのパスキーはすべて削除され、次のログインでパスワードの変更が必要になります。`);
		if (pw === null) return;
		error = null;
		try {
			await resetUserPassword(u.id, pw);
			notice = `${u.username} に仮パスワードを設定し、パスキーを削除しました(次のログインでパスワードの変更が必要)。`;
			await reload();
		} catch (e) {
			error = e instanceof Error ? e.message : 'パスワード変更に失敗しました。';
		}
	}

	async function issueLink(u: AdminUser) {
		const msg = u.resetLinkExpiresAt
			? `${u.username} のリセットリンクを再発行しますか?\n未使用の古いリンクは使えなくなります。`
			: `${u.username} のリセットリンクを発行しますか?\n本人がリンクを使うと、パスワードとパスキーがすべて置き換わります。`;
		if (!confirm(msg)) return;
		error = null;
		notice = null;
		try {
			const res = await issueResetLink(u.id);
			issued = { username: u.username, url: res.url };
			copied = false;
			await reload();
		} catch (e) {
			error = e instanceof Error ? e.message : 'リセットリンクの発行に失敗しました。';
		}
	}

	async function revokeLink(u: AdminUser) {
		if (!confirm(`${u.username} のリセットリンクを取り消しますか?`)) return;
		error = null;
		try {
			await revokeResetLink(u.id);
			if (issued?.username === u.username) issued = null;
			notice = `${u.username} のリセットリンクを取り消しました。`;
			await reload();
		} catch (e) {
			error = e instanceof Error ? e.message : 'リセットリンクの取り消しに失敗しました。';
		}
	}

	async function copyIssued() {
		if (!issued) return;
		await navigator.clipboard.writeText(issued.url);
		copied = true;
	}
</script>

<svelte:head><title>ユーザー管理 — Lowest Finder</title></svelte:head>

<div class="page">
	<h1>ユーザー管理</h1>
	{#if error}<p class="err">{error}</p>{/if}
	{#if notice}<p class="notice">{notice}</p>{/if}
	{#if issued}
		<section class="card issued">
			<p>
				<strong>{issued.username}</strong> のリセットリンク(24時間有効・1回限り)。この URL はいましか表示されません。本人に渡してください。
			</p>
			<div class="issued-row">
				<input type="text" readonly value={issued.url} onfocus={(e) => e.currentTarget.select()} />
				<button type="button" onclick={copyIssued}>{copied ? 'コピーしました' : 'コピー'}</button>
				<button type="button" class="link" onclick={() => (issued = null)}>閉じる</button>
			</div>
		</section>
	{/if}

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
							<td>
								{formatDateTime(u.createdAt)}
								{#if u.resetLinkExpiresAt}
									<span class="link-state">リンク発行中(〜{formatDateTime(u.resetLinkExpiresAt)})</span>
								{/if}
							</td>
							<td class="ops">
								{#if me.role === 'admin' && canSetRole(me.role, u.role, 'admin')}
									<button type="button" onclick={() => promote(u)}>管理者にする</button>
								{/if}
								{#if u.id !== me.id && canResetPassword(me.role, u.role)}
									<button type="button" onclick={() => resetPassword(u)}>仮パスワード</button>
									<button type="button" onclick={() => issueLink(u)}>リセットリンク</button>
									{#if u.resetLinkExpiresAt}
										<button type="button" onclick={() => revokeLink(u)}>リンク取り消し</button>
									{/if}
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
	.issued {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		font-size: 0.85rem;
	}
	.issued p {
		margin: 0;
	}
	.issued-row {
		display: flex;
		gap: 0.4rem;
	}
	.issued-row input {
		flex: 1;
		min-width: 0;
	}
	.link {
		background: none;
		border: none;
		color: var(--muted);
		text-decoration: underline;
		padding: 0;
	}
	.link-state {
		display: block;
		color: var(--muted);
		font-size: 0.75rem;
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
