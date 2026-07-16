<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { enhance } from '$app/forms';
	import { canAccessAdmin } from '$lib/rbac';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Lowest Finder — 容量単価比較</title>
</svelte:head>

<div class="app">
	<header class="topbar">
		<div class="inner">
			<a class="brand" href="/">
				<span class="logo">¥</span>
				<span class="name">Lowest Finder</span>
			</a>
			{#if data.user}
				<div class="account">
					{#if canAccessAdmin(data.user.role)}
						<a class="nav-link" href="/admin/users">管理</a>
					{/if}
					<a class="nav-link" href="/account">アカウント</a>
					<span class="mode member">@{data.user.username}</span>
					<form method="POST" action="/logout" use:enhance>
						<button type="submit" class="logout">ログアウト</button>
					</form>
				</div>
			{:else}
				<div class="account">
					<span class="mode">ゲスト</span>
					<a class="login-link" href="/login">ログイン</a>
				</div>
			{/if}
		</div>
	</header>

	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	.app {
		min-height: 100dvh;
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}

	.inner {
		max-width: 760px;
		margin: 0 auto;
		padding: 0.6rem 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
		color: var(--text);
		font-weight: 700;
	}

	.logo {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		background: var(--primary);
		color: #fff;
		font-weight: 800;
	}

	.account {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.mode {
		font-size: 0.8rem;
		color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
	}

	.mode.member {
		color: var(--primary);
		border-color: var(--primary);
		font-weight: 600;
	}

	.login-link {
		font-size: 0.85rem;
		text-decoration: none;
	}

	.nav-link {
		font-size: 0.85rem;
		text-decoration: none;
		color: var(--text);
	}

	.nav-link:hover {
		color: var(--primary);
	}

	.logout {
		font-size: 0.8rem;
		padding: 0.25rem 0.6rem;
	}

	.content {
		max-width: 760px;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
