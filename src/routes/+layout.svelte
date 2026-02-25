<script lang="ts">
	import type { LayoutData } from './$types';
	import { page } from '$app/state';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const isServe = $derived(page.url.pathname.startsWith('/serve/'));
</script>

<svelte:head>
	<title>Drive Site Builder</title>
</svelte:head>

{#if isServe}
	{@render children()}
{:else}
	{#if data.user}
		<nav class="nav">
			<a href="/dashboard" class="nav-brand">Drive Site Builder</a>
			<div class="nav-right">
				<img src={data.user.picture} alt={data.user.name} class="avatar" referrerpolicy="no-referrer" />
				<span class="nav-email">{data.user.email}</span>
				<a href="/auth/logout" class="btn-ghost">Sign out</a>
			</div>
		</nav>
	{/if}

	<main class:no-nav={!data.user}>
		{@render children()}
	</main>
{/if}

<style>
	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #f8f9fa;
		color: #212529;
		line-height: 1.5;
	}

	:global(a) {
		color: #4f46e5;
		text-decoration: none;
	}

	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 1.5rem;
		height: 56px;
		background: #fff;
		border-bottom: 1px solid #e5e7eb;
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.nav-brand {
		font-weight: 700;
		font-size: 1rem;
		color: #111;
	}

	.nav-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
	}

	.nav-email {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.btn-ghost {
		font-size: 0.875rem;
		padding: 0.35rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		color: #374151;
	}

	.btn-ghost:hover {
		background: #f3f4f6;
	}

	main {
		padding: 2rem 1.5rem;
		max-width: 1100px;
		margin: 0 auto;
	}

	main.no-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 0;
	}
</style>
