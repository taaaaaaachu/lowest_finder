<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Lowest Finder — 容量単価くらべ</title>
</svelte:head>

<div class="app">
	<header class="topbar">
		<div class="inner">
			<a class="brand" href="/">
				<span class="logo">¥</span>
				<span class="name">Lowest Finder</span>
			</a>
			<span class="mode">ゲスト</span>
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

	.mode {
		font-size: 0.8rem;
		color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
	}

	.content {
		max-width: 760px;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
