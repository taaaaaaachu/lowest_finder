<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDateTime } from '#lib/format.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Lowest Finder への招待</title></svelte:head>

<div class="auth card">
	<h1>Lowest Finder への招待</h1>
	{#if data.invite.issuer}<p class="hint">{data.invite.issuer} さんからの招待です。</p>{/if}

	{#if data.unusable}
		<p class="err">{data.unusable}招待した人に再発行を依頼してください。</p>
	{:else if data.loggedIn}
		<p>このリンクは新しくアカウントを登録するためのものです。既にログインしています。</p>
		<a href={resolve('/')}>トップへ</a>
	{:else}
		<p class="hint">
			この招待で会員登録できます{data.invite.expiresAt !== null
				? `(${formatDateTime(data.invite.expiresAt)} まで)`
				: ''}。
		</p>
		<!-- クエリ付きの移動先なので GET フォームで送る。 -->
		<form method="GET" action={resolve('/register')} class="auth-form">
			<input type="hidden" name="invite" value={data.code} />
			<button type="submit" class="primary">アカウントを登録する</button>
		</form>
		<p class="alt">すでにアカウントがある場合は <a href={resolve('/login')}>ログイン</a></p>
	{/if}
</div>

<style>
	.auth {
		max-width: 420px;
		margin: 2rem auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.hint {
		color: var(--muted);
		font-size: 0.9rem;
		margin: 0;
	}
	p {
		margin: 0;
	}
	.err {
		color: var(--danger);
		font-size: 0.9rem;
	}
	.auth-form {
		display: flex;
		flex-direction: column;
	}
	.alt {
		font-size: 0.9rem;
		text-align: center;
	}
</style>
