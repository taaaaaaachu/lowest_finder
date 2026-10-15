<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { goto } from '$app/navigation';
	import { signupWithPasskey, isPasskeyCancel } from '$lib/admin/client';
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	let method = $state<'passkey' | 'password'>('passkey');
	let passkeyError = $state<string | null>(null);
	let busy = $state(false);

	/** パスキーで登録する場合はフォームアクションを送らず API で登録する。 */
	const submit: SubmitFunction = ({ cancel, formData }) => {
		if (method !== 'passkey') return;
		cancel();
		signup(formData);
	};

	async function signup(fd: FormData) {
		passkeyError = null;
		busy = true;
		try {
			await signupWithPasskey(String(fd.get('username') ?? ''), String(fd.get('invite') ?? ''));
			await goto('/?welcome=1', { invalidateAll: true });
		} catch (err) {
			if (!isPasskeyCancel(err)) {
				passkeyError = err instanceof Error ? err.message : '登録に失敗しました。';
			}
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>会員登録 — Lowest Finder</title></svelte:head>

<div class="auth card">
	<h1>会員登録</h1>
	<p class="hint">登録するとデータがサーバーに保存され、他の端末からも見られます。</p>

	<form method="POST" use:enhance={submit} class="auth-form">
		{#if form?.error}<p class="err">{form.error}</p>{/if}
		{#if passkeyError}<p class="err">{passkeyError}</p>{/if}
		{#if data.requireInvite}
			<label class="field">
				<span>招待コード</span>
				<input name="invite" type="text" autocomplete="off" placeholder="既存ユーザーから受け取ったコード" required />
			</label>
		{:else}
			<p class="note">最初のアカウントです。招待コードなしで登録できます。</p>
		{/if}
		<label class="field">
			<span>ユーザー名(3〜32文字, 英数字と _ . -)</span>
			<input name="username" type="text" autocomplete="username" value={form?.username ?? ''} required />
		</label>

		<fieldset class="method">
			<legend>ログイン方法</legend>
			<label><input type="radio" bind:group={method} value="passkey" /> パスキー(指紋・顔認証など)</label>
			<label><input type="radio" bind:group={method} value="password" /> パスワード</label>
		</fieldset>

		{#if method === 'password'}
			<label class="field">
				<span>パスワード(8文字以上)</span>
				<input name="password" type="password" autocomplete="new-password" required />
			</label>
		{:else}
			<p class="hint">登録後、アカウント画面からパスワードやほかの端末のパスキーも追加できます。</p>
		{/if}
		<button type="submit" class="primary" disabled={busy}>{busy ? '確認中…' : '登録する'}</button>
	</form>

	<p class="alt">すでにアカウントがある場合は <a href="/login">ログイン</a></p>
</div>

<style>
	.auth {
		max-width: 420px;
		margin: 2rem auto;
		padding: 1.5rem;
	}
	.hint {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0 0 1.25rem;
	}
	.auth-form .hint {
		margin: 0;
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
	.method {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border: none;
		padding: 0;
		margin: 0;
		font-size: 0.9rem;
	}
	.method legend {
		font-size: 0.85rem;
		color: var(--muted);
		margin-bottom: 0.3rem;
	}
	.method input {
		width: auto;
	}
	.err {
		margin: 0;
		color: var(--danger);
		font-size: 0.9rem;
	}
	.note {
		margin: 0;
		padding: 0.6rem 0.75rem;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 8px;
		color: #1e40af;
		font-size: 0.85rem;
	}
	.alt {
		margin-top: 1.25rem;
		font-size: 0.9rem;
		text-align: center;
	}
</style>
