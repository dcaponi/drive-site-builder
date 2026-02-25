<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="login-box">
	<div class="logo">🗂️</div>
	<h1>Drive Site Builder</h1>
	<p class="tagline">Turn Google Drive folders into websites — powered by AI</p>

	{#if data.error}
		<div class="error-banner">{data.error}</div>
	{/if}

	<a href="/auth/login" class="btn-google">
		<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
			<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.7 2.4 30.2 0 24 0 14.7 0 6.8 5.5 2.9 13.5l7.9 6.1C12.6 13.4 17.9 9.5 24 9.5z"/>
			<path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.8-2.1 5.2-4.5 6.8l7 5.4C43.1 37 46.1 31.3 46.1 24.5z"/>
			<path fill="#FBBC05" d="M10.8 28.6A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.7-4.6L2.3 13.3A23.9 23.9 0 0 0 0 24c0 3.8.9 7.4 2.5 10.6l8.3-6z"/>
			<path fill="#34A853" d="M24 48c6.1 0 11.2-2 14.9-5.5l-7-5.4c-2 1.3-4.5 2.1-7.9 2.1-6.1 0-11.3-4-13.2-9.5l-8.1 6.2C6.8 42.5 14.8 48 24 48z"/>
		</svg>
		Sign in with Google
	</a>

	<p class="hint">You'll be asked to grant access to Google Drive, Sheets, and Docs.</p>
</div>

<style>
	.login-box {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 3rem 2.5rem;
		text-align: center;
		width: 100%;
		max-width: 420px;
		box-shadow: 0 4px 24px rgba(0,0,0,.07);
	}

	.logo {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	h1 {
		font-size: 1.6rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.tagline {
		color: #6b7280;
		margin-bottom: 2rem;
		font-size: 0.95rem;
	}

	.btn-google {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1.5rem;
		background: #fff;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 0.95rem;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: background 0.15s;
		text-decoration: none;
	}

	.btn-google:hover {
		background: #f9fafb;
	}

	.hint {
		margin-top: 1.5rem;
		font-size: 0.8rem;
		color: #9ca3af;
	}

	.error-banner {
		background: #fef2f2;
		border: 1px solid #fca5a5;
		color: #b91c1c;
		border-radius: 6px;
		padding: 0.75rem 1rem;
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
	}
</style>
