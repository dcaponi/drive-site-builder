<script lang="ts">
	import type { PageData } from './$types';
	import type { ActionData } from './$types';
	import ChatBubble from '$lib/components/ChatBubble.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let iframeEl: HTMLIFrameElement | undefined = $state();

	function reloadApp() {
		if (iframeEl) iframeEl.src = iframeEl.src;
	}

	const canChat = data.can_chat === true;
</script>

<svelte:head>
	<title>{data.app.name}</title>
</svelte:head>

{#if !data.authed}
	<!-- Standard app password login -->
	<div class="login-wrapper">
		<div class="login-card">
			<h1>{data.app.name}</h1>
			<p class="login-subtitle">This app is password protected.</p>

			{#if form?.error}
				<div class="login-error">{form.error}</div>
			{/if}

			<form method="POST" action="?/login" class="login-form">
				<label>
					<span>Email</span>
					<input type="email" name="email" required autocomplete="email" />
				</label>
				<label>
					<span>Password</span>
					<input type="password" name="password" required autocomplete="current-password" />
				</label>
				<button type="submit" class="login-btn">Sign in</button>
			</form>
		</div>
	</div>

{:else if data.app.generated_code_doc_id}
	<iframe
		bind:this={iframeEl}
		src="/serve/{data.app.id}/content"
		title={data.app.name}
	></iframe>
	{#if canChat}
		<ChatBubble appId={data.app.id} onUpdated={reloadApp} />
	{/if}
{:else}
	<div class="not-built">
		<h2>Not built yet</h2>
		<p>Go to the <a href="/app/{data.app.id}">app page</a> and click "Build App".</p>
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

	.login-error {
		background: #fef2f2;
		border: 1px solid #fca5a5;
		color: #b91c1c;
		font-size: 0.875rem;
		border-radius: 8px;
		padding: 0.65rem 0.9rem;
		margin-bottom: 1rem;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.login-form label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.login-form label span {
		font-size: 0.8rem;
		font-weight: 500;
		color: #374151;
	}

	.login-form input {
		padding: 0.6rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 0.9rem;
		font-family: inherit;
	}

	.login-form input:focus {
		outline: none;
		border-color: #4f46e5;
		box-shadow: 0 0 0 2px #e0e7ff;
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
	}

	.not-built h2 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.not-built a {
		color: #4f46e5;
	}
</style>
