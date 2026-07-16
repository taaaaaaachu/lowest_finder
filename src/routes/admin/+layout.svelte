<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();

	const tabs = [
		{ href: '/admin/users', label: 'ユーザー管理' },
		{ href: '/admin/invites', label: '招待管理' }
	];
</script>

<nav class="tabs">
	{#each tabs as tab (tab.href)}
		<a href={tab.href} class:active={page.url.pathname === tab.href}>{tab.label}</a>
	{/each}
</nav>

{@render children()}

<style>
	.tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		border-bottom: 1px solid var(--border);
	}
	.tabs a {
		padding: 0.5rem 0.85rem;
		text-decoration: none;
		color: var(--muted);
		border-bottom: 2px solid transparent;
		font-size: 0.9rem;
	}
	.tabs a.active {
		color: var(--primary);
		border-bottom-color: var(--primary);
		font-weight: 600;
	}
</style>
