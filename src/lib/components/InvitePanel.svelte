<script lang="ts">
	import { onMount } from 'svelte';
	import { createInvite, listInvites, type InviteInfo } from '$lib/repo/api';
	import { formatDateTime } from '$lib/format';

	let invites = $state<InviteInfo[]>([]);
	let expiry = $state('168'); // 既定: 7日
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

	onMount(reload);

	async function reload() {
		try {
			invites = await listInvites();
		} catch (e) {
			error = e instanceof Error ? e.message : '招待一覧の取得に失敗しました。';
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
			error = e instanceof Error ? e.message : '招待コードの発行に失敗しました。';
		} finally {
			creating = false;
		}
	}

	async function copyCode(code: string) {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* クリップボード不可の環境は無視(手動コピー) */
		}
	}

	function statusLabel(inv: InviteInfo): string {
		if (inv.status === 'used') return '使用済み';
		if (inv.status === 'expired') return '期限切れ';
		return inv.expiresAt === null ? '有効(無期限)' : `有効(〜${formatDateTime(inv.expiresAt)})`;
	}
</script>

<section class="invite card">
	<h2>友だち・家族を招待</h2>
	<p class="desc">会員登録には招待コードが必要です。ここで発行して相手に渡してください(1コード1人・単回使用)。</p>

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
			{creating ? '発行中…' : '招待コードを発行'}
		</button>
	</div>

	{#if error}<p class="err">{error}</p>{/if}

	{#if lastCode}
		<div class="new-code">
			<span class="label">発行しました:</span>
			<code>{lastCode}</code>
			<button type="button" onclick={() => copyCode(lastCode!)}>{copied ? 'コピー済' : 'コピー'}</button>
		</div>
	{/if}

	{#if invites.length > 0}
		<ul class="list">
			{#each invites as inv (inv.code)}
				<li class:used={inv.status !== 'active'}>
					<code>{inv.code}</code>
					<span class="status">{statusLabel(inv)}</span>
					{#if inv.status === 'active'}
						<button type="button" class="mini" onclick={() => copyCode(inv.code)}>コピー</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.invite {
		margin-top: 1.25rem;
		padding: 1rem;
	}
	.invite h2 {
		font-size: 1rem;
		margin-bottom: 0.35rem;
	}
	.desc {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0 0 0.85rem;
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
	}
	.issue .field {
		flex: 1;
	}
	.err {
		margin: 0.6rem 0 0;
		color: var(--danger);
		font-size: 0.85rem;
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
	.new-code .label {
		font-size: 0.85rem;
		color: var(--muted);
	}
	code {
		font-family: ui-monospace, monospace;
		font-weight: 700;
		background: #f0f2f5;
		padding: 0.15rem 0.4rem;
		border-radius: 6px;
	}
	.list {
		list-style: none;
		margin: 0.85rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.85rem;
	}
	.list li.used {
		opacity: 0.55;
	}
	.list .status {
		color: var(--muted);
	}
	.mini {
		margin-left: auto;
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
	}
</style>
