<script lang="ts">
	import { onMount } from 'svelte';
	import {
		listInvites,
		createInvite,
		revokeInvite,
		deleteInvite,
		type AdminInvite
	} from '$lib/admin/client';
	import { formatDateTime } from '$lib/format';

	let invites = $state<AdminInvite[]>([]);
	let expiry = $state('168');
	let creating = $state(false);
	let error = $state<string | null>(null);
	let lastCode = $state<string | null>(null);
	let copied = $state(false);

	const EXPIRY_OPTIONS = [
		{ value: '1', label: '1時間' },
		{ value: '24', label: '1日' },
		{ value: '168', label: '7日' },
		{ value: '720', label: '30日' },
		{ value: 'none', label: '無期限' }
	];

	const STATE_LABEL: Record<AdminInvite['state'], string> = {
		active: '有効',
		used: '使用済み',
		expired: '期限切れ',
		revoked: '無効化'
	};

	onMount(reload);

	async function reload() {
		try {
			invites = await listInvites();
		} catch (e) {
			error = e instanceof Error ? e.message : '一覧の取得に失敗しました。';
		}
	}

	async function issue() {
		creating = true;
		error = null;
		copied = false;
		try {
			const hours = expiry === 'none' ? null : Number(expiry);
			const res = await createInvite(hours);
			lastCode = res.code;
			await reload();
		} catch (e) {
			error = e instanceof Error ? e.message : '発行に失敗しました。';
		} finally {
			creating = false;
		}
	}

	async function copy(code: string) {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* 無視 */
		}
	}

	async function revoke(inv: AdminInvite) {
		if (!confirm(`招待コード ${inv.code} を無効化しますか?(記録は残ります)`)) return;
		error = null;
		try {
			await revokeInvite(inv.id);
			await reload();
		} catch (e) {
			error = e instanceof Error ? e.message : '無効化に失敗しました。';
		}
	}

	async function remove(inv: AdminInvite) {
		if (!confirm(`招待コード ${inv.code} を完全に削除しますか?(記録も消えます)`)) return;
		error = null;
		try {
			await deleteInvite(inv.id);
			await reload();
		} catch (e) {
			error = e instanceof Error ? e.message : '削除に失敗しました。';
		}
	}

	function expiryText(inv: AdminInvite): string {
		if (inv.expiresAt === null) return '無期限';
		return `〜${formatDateTime(inv.expiresAt)}`;
	}
</script>

<svelte:head><title>招待管理 — Lowest Finder</title></svelte:head>

<div class="page">
	<h1>招待管理</h1>

	<section class="card issue-card">
		<h2>招待コードを発行</h2>
		<div class="issue">
			<label class="field">
				<span>有効期限</span>
				<select bind:value={expiry}>
					{#each EXPIRY_OPTIONS as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>
			<button type="button" class="primary" onclick={issue} disabled={creating}>
				{creating ? '発行中…' : '発行'}
			</button>
		</div>
		{#if lastCode}
			<div class="new-code">
				<span>発行しました:</span>
				<code>{lastCode}</code>
				<button type="button" onclick={() => copy(lastCode!)}>{copied ? 'コピー済' : 'コピー'}</button>
			</div>
		{/if}
	</section>

	{#if error}<p class="err">{error}</p>{/if}

	<section class="card">
		<h2>招待コード一覧</h2>
		{#if invites.length === 0}
			<p class="empty">まだ招待コードはありません。</p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr><th>コード</th><th>状態</th><th>期限</th><th>発行者</th><th>使用者</th><th></th></tr>
					</thead>
					<tbody>
						{#each invites as inv (inv.id)}
							<tr class="state-{inv.state}">
								<td><code>{inv.code}</code></td>
								<td><span class="badge {inv.state}">{STATE_LABEL[inv.state]}</span></td>
								<td>{expiryText(inv)}</td>
								<td>{inv.issuer ?? '(削除済)'}</td>
								<td>{inv.invitee ?? '—'}</td>
								<td class="ops">
									{#if inv.state === 'active'}
										<button type="button" onclick={() => revoke(inv)}>無効化</button>
									{/if}
									<button type="button" class="danger" onclick={() => remove(inv)}>削除</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	h1 {
		font-size: 1.3rem;
	}
	.card {
		padding: 1rem;
	}
	.card h2 {
		font-size: 1rem;
		margin-bottom: 0.75rem;
	}
	.issue {
		display: flex;
		align-items: flex-end;
		gap: 0.6rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		color: var(--muted);
		flex: 1;
	}
	.new-code {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.85rem;
		padding: 0.6rem 0.75rem;
		background: var(--best-bg);
		border: 1px solid var(--best);
		border-radius: 8px;
		flex-wrap: wrap;
	}
	code {
		font-family: ui-monospace, monospace;
		font-weight: 700;
		background: #f0f2f5;
		padding: 0.15rem 0.4rem;
		border-radius: 6px;
	}
	.err {
		color: var(--danger);
		font-size: 0.9rem;
		margin: 0;
	}
	.empty {
		color: var(--muted);
		text-align: center;
		padding: 1rem 0;
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
	tr.state-used,
	tr.state-expired,
	tr.state-revoked {
		color: var(--muted);
	}
	.badge {
		font-size: 0.75rem;
		font-weight: 700;
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
		background: #f0f2f5;
	}
	.badge.active {
		background: var(--best-bg);
		color: var(--best);
	}
	.badge.revoked {
		background: #fef2f2;
		color: var(--danger);
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
