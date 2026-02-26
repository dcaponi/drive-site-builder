<script lang="ts">
	import type { PageData } from './$types';
	import type { ActionData } from './$types';
	import ChatBubble from '$lib/components/ChatBubble.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let iframeEl: HTMLIFrameElement | undefined = $state();

	// User auth UI state
	let authTab = $state<'login' | 'signup'>('login');
	let showAdminLogin = $state(false);

	function reloadApp() {
		if (iframeEl) iframeEl.src = iframeEl.src;
	}

	const canChat = data.role === 'app-owner' || data.role === 'root';
</script>

<svelte:head>
	{#if data.homeApp}
		<title>{data.homeApp.name}</title>
	{:else}
		<title>Drive Site Builder</title>
	{/if}
</svelte:head>

{#if data.homeApp}
	{#if data.showUserAuth}
		<!-- User sign-up / login UI -->
		<div class="login-wrapper">
			<div class="login-card">
				<h1>{data.homeApp.name}</h1>

				{#if !showAdminLogin}
					<div class="auth-tabs">
						<button
							class="tab-btn {authTab === 'login' ? 'active' : ''}"
							onclick={() => (authTab = 'login')}
						>Sign in</button>
						<button
							class="tab-btn {authTab === 'signup' ? 'active' : ''}"
							onclick={() => (authTab = 'signup')}
						>Create account</button>
					</div>

					{#if form?.error}
						<div class="login-error">{form.error}</div>
					{/if}

					{#if authTab === 'login'}
						<form method="POST" action="?/userLogin" class="login-form">
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
					{:else}
						<form method="POST" action="?/signup" class="login-form">
							<label>
								<span>Email</span>
								<input type="email" name="email" required autocomplete="email" />
							</label>
							<label>
								<span>Password</span>
								<input type="password" name="password" required autocomplete="new-password" />
							</label>
							<label>
								<span>Confirm password</span>
								<input type="password" name="confirm_password" required autocomplete="new-password" />
							</label>
							<button type="submit" class="login-btn">Create account</button>
						</form>
					{/if}

					<button class="admin-link" onclick={() => (showAdminLogin = true)}>
						Admin access
					</button>
				{:else}
					<p class="login-subtitle">Admin sign in</p>

					{#if form?.error}
						<div class="login-error">{form.error}</div>
					{/if}

					<form method="POST" action="?/login" class="login-form">
						<label>
							<span>Email</span>
							<input type="email" name="email" required autocomplete="email" />
						</label>
						<label>
							<span>App password</span>
							<input type="password" name="password" required autocomplete="current-password" />
						</label>
						<button type="submit" class="login-btn">Sign in as admin</button>
					</form>

					<button class="admin-link" onclick={() => (showAdminLogin = false)}>
						← Back to user login
					</button>
				{/if}
			</div>
		</div>

	{:else if !data.authed}
		<!-- Standard app password login -->
		<div class="login-wrapper">
			<div class="login-card">
				<h1>{data.homeApp.name}</h1>
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

	{:else if data.homeApp.generated_code_doc_id}
		<iframe
			bind:this={iframeEl}
			src="/serve/{data.homeApp.id}/content"
			title={data.homeApp.name}
		></iframe>
		{#if canChat}
			<ChatBubble appId={data.homeApp.id} onUpdated={reloadApp} />
		{/if}
	{:else}
		<div class="not-built">
			<h2>Not built yet</h2>
			<p>Go to the <a href="/app/{data.homeApp.id}">app page</a> and click "Build App".</p>
		</div>
	{/if}
{:else}
	<!-- Fallback: shouldn't normally reach here since server redirects -->
	<div class="login-wrapper">
		<div class="login-box">
			<div class="logo">🗂️</div>
			<h1>Drive Site Builder</h1>
			<p class="tagline">Turn Google Drive folders into websites — powered by AI</p>
			<a href="/login" class="login-btn">Sign in</a>
		</div>
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

	.login-card, .login-box {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 16px;
		padding: 2.5rem 2rem;
		width: 100%;
		max-width: 380px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.07);
		text-align: center;
	}

	.logo {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 0.35rem;
		color: #111;
	}

	.tagline {
		color: #6b7280;
		margin-bottom: 2rem;
		font-size: 0.95rem;
	}

	.login-subtitle {
		font-size: 0.875rem;
		color: #9ca3af;
		margin-bottom: 1.5rem;
	}

	.auth-tabs {
		display: flex;
		gap: 0;
		margin-bottom: 1.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
	}

	.tab-btn {
		flex: 1;
		padding: 0.5rem;
		background: none;
		border: none;
		font-size: 0.875rem;
		cursor: pointer;
		color: #6b7280;
		transition: background 0.1s, color 0.1s;
	}

	.tab-btn.active {
		background: #4f46e5;
		color: #fff;
		font-weight: 600;
	}

	.tab-btn:hover:not(.active) { background: #f9fafb; }

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
		text-align: left;
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
		text-decoration: none;
		display: inline-block;
	}

	.login-btn:hover {
		background: #4338ca;
	}

	.admin-link {
		display: block;
		width: 100%;
		text-align: center;
		font-size: 0.78rem;
		color: #9ca3af;
		background: none;
		border: none;
		cursor: pointer;
		margin-top: 1.25rem;
		padding: 0;
	}

	.admin-link:hover { color: #6b7280; text-decoration: underline; }

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
