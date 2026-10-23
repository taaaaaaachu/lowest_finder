<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser';
	import { loginWithPasskey, isPasskeyCancel } from '$lib/admin/client';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let passkeyError = $state<string | null>(null);
	let busy = $state(false);

	async function passkeyLogin(useBrowserAutofill: boolean) {
		try {
			await loginWithPasskey(useBrowserAutofill);
			await goto(resolve('/'), { invalidateAll: true });
		} catch (err) {
			if (isPasskeyCancel(err)) return;
			passkeyError = err instanceof Error ? err.message : 'パスキーでログインできませんでした。';
		}
	}

	async function onPasskeyButton() {
		passkeyError = null;
		busy = true;
		await passkeyLogin(false);
		busy = false;
	}

	// ユーザー名欄のオートフィルにパスキーを出す(対応ブラウザのみ)。
	onMount(async () => {
		if (await browserSupportsWebAuthnAutofill()) passkeyLogin(true);
	});
</script>

<svelte:head><title>ログイン — Lowest Finder</title></svelte:head>

<div class="auth card">
	<h1>ログイン</h1>

	<button type="button" class="primary passkey" onclick={onPasskeyButton} disabled={busy}>
		{busy ? '確認中…' : 'パスキーでログイン'}
	</button>
	{#if passkeyError}<p class="err">{passkeyError}</p>{/if}

	<p class="or">または パスワードでログイン</p>

	<form method="POST" use:enhance class="auth-form">
		{#if form?.error}<p class="err">{form.error}</p>{/if}
		<label class="field">
			<span>ユーザー名</span>
			<input
				name="username"
				type="text"
				autocomplete="username webauthn"
				value={form?.username ?? ''}
				required
			/>
		</label>
		<label class="field">
			<span>パスワード</span>
			<input name="password" type="password" autocomplete="current-password" required />
		</label>
		<button type="submit">ログイン</button>
	</form>

	<p class="alt">アカウントがない場合は <a href={resolve('/register')}>会員登録</a></p>
</div>

<style>
	.auth {
		max-width: 420px;
		margin: 2rem auto;
		padding: 1.5rem;
	}
	.passkey {
		width: 100%;
	}
	.or {
		margin: 1.25rem 0 0.75rem;
		color: var(--muted);
		font-size: 0.85rem;
		text-align: center;
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
		margin: 0.5rem 0 0;
		color: var(--danger);
		font-size: 0.9rem;
	}
	.auth-form .err {
		margin: 0;
	}
	.alt {
		margin-top: 1.25rem;
		font-size: 0.9rem;
		text-align: center;
	}
</style>
