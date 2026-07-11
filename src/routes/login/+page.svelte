<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>ログイン — Lowest Finder</title></svelte:head>

<div class="auth card">
	<h1>ログイン</h1>

	<form method="POST" use:enhance class="auth-form">
		{#if form?.error}<p class="err">{form.error}</p>{/if}
		<label class="field">
			<span>ユーザー名</span>
			<input name="username" type="text" autocomplete="username" value={form?.username ?? ''} required />
		</label>
		<label class="field">
			<span>パスワード</span>
			<input name="password" type="password" autocomplete="current-password" required />
		</label>
		<button type="submit" class="primary">ログイン</button>
	</form>

	<p class="alt">アカウントがない場合は <a href="/register">会員登録</a></p>
</div>

<style>
	.auth {
		max-width: 420px;
		margin: 2rem auto;
		padding: 1.5rem;
	}
	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.err {
		margin: 0;
		color: var(--danger);
		font-size: 0.9rem;
	}
	.alt {
		margin-top: 1.25rem;
		font-size: 0.9rem;
		text-align: center;
	}
</style>
