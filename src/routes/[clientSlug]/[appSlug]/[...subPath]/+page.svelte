<script lang="ts">
	import type { PageData } from './$types';
	import ChatBubble from '$lib/components/ChatBubble.svelte';

	let { data }: { data: PageData } = $props();

	let iframeEl: HTMLIFrameElement | undefined = $state();

	function reloadApp() {
		if (iframeEl) iframeEl.src = iframeEl.src;
	}

	const canChat = data.can_chat === true;
	const contentSrc = $derived(
		`/serve/${data.app.id}/content${data.subPath === '/' ? '' : data.subPath}`
	);
</script>

<svelte:head>
	<title>{data.app.name}</title>
</svelte:head>

{#if !data.authed}
	<div class="login-wrapper">
		<div class="login-card">
			<h1>{data.app.name}</h1>
			<p class="login-subtitle">This app is for members only.</p>
			<a href="/serve/{data.app.id}/login" class="login-btn">Sign in</a>
		</div>
	</div>

{:else if data.hasPage}
	<iframe
		bind:this={iframeEl}
		src={contentSrc}
		title={data.app.name}
	></iframe>
	{#if canChat}
		<ChatBubble appId={data.app.id} subPath={data.subPath} onUpdated={reloadApp} />
	{/if}
{:else}
	<div class="not-built">
		<h2>Page not built yet</h2>
		<p>
			{#if data.subPath === '/'}
				Go to the <a href="/app/{data.app.id}">app page</a> and click "Build App".
			{:else}
				This route ({data.subPath}) hasn't been built yet — open the app's dashboard to build it.
			{/if}
		</p>
	</div>
{/if}

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		height: 100%;
		overflow: hidden;
	}

	iframe {
		width: 100vw;
		height: 100vh;
		border: none;
		display: block;
	}

	.login-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: #f8f9fa;
		padding: 1.5rem;
		overflow: auto;
	}

	.login-card {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 16px;
		padding: 2.5rem 2rem;
		width: 100%;
		max-width: 380px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.07);
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 0.35rem;
		color: #111;
	}

	.login-subtitle {
		font-size: 0.875rem;
		color: #9ca3af;
		margin-bottom: 1.5rem;
	}

	.login-btn {
		background: #4f46e5;
		color: #fff;
		border: none;
		border-radius: 8px;
		padding: 0.7rem;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		margin-top: 0.25rem;
		text-decoration: none;
		display: inline-block;
	}

	.login-btn:hover {
		background: #4338ca;
	}

	.not-built {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		font-family: sans-serif;
		color: #6b7280;
		padding: 1.5rem;
		text-align: center;
	}

	.not-built h2 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.not-built a {
		color: #4f46e5;
	}
</style>
