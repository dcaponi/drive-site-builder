<script lang="ts">
	import { tick } from 'svelte';

	let { appId, subPath = '/', onUpdated }: { appId: string; subPath?: string; onUpdated?: () => void } = $props();

	type UserMsg = { type: 'user'; text: string };
	type AssistantMsg = { type: 'assistant'; text: string; streaming?: boolean };
	type UpdateRefMsg = { type: 'update-ref'; jobId: string; summary: string };
	type Msg = UserMsg | AssistantMsg | UpdateRefMsg;

	type JobState = {
		jobId: string;
		status: 'pending' | 'running' | 'done' | 'error';
		progress: string;
		error?: string;
	};

	let open = $state(false);
	let message = $state('');
	let sending = $state(false);
	let errorMsg = $state('');
	let history = $state<Msg[]>([]);
	let activeJob = $state<JobState | null>(null);

	// Spend cutoff
	let cutoffInfo = $state<{ message: string; spend: number; limit: number } | null>(null);
	let userApiKey = $state('');
	let showApiKeyInput = $state(false);

	let textarea: HTMLTextAreaElement | undefined = $state();
	let historyDiv: HTMLDivElement | undefined = $state();

	function resize() {
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
	}

	async function scrollToBottom() {
		await tick();
		if (historyDiv) historyDiv.scrollTop = historyDiv.scrollHeight;
	}

	function startPolling(jobId: string) {
		const interval = setInterval(async () => {
			try {
				const res = await fetch(`/api/apps/${appId}/jobs/${jobId}`);
				if (!res.ok) return;
				const job = await res.json();

				activeJob = {
					jobId,
					status: job.status,
					progress: job.progress,
					error: job.error
				};

				if (job.status === 'done') {
					clearInterval(interval);
					activeJob = null;
					onUpdated?.();
					// Update the update-ref message
					history = history.map((m) =>
						m.type === 'update-ref' && m.jobId === jobId
							? { ...m, summary: 'Update applied successfully.' }
							: m
					);
				} else if (job.status === 'error') {
					clearInterval(interval);
					// Mark the update-ref message as failed
					history = history.map((m) =>
						m.type === 'update-ref' && m.jobId === jobId
							? { ...m, summary: `Update failed: ${job.error ?? 'Unknown error'}` }
							: m
					);
					activeJob = null;
				}
			} catch {
				// ignore transient polling errors
			}
		}, 2000);
	}

	async function send() {
		if (!message.trim() || sending) return;

		const req = message.trim();
		message = '';
		errorMsg = '';

		// Add user message immediately
		history = [...history, { type: 'user', text: req }];
		await scrollToBottom();

		sending = true;

		try {
			// Retrieve stored API key from session storage
		const storedKey = sessionStorage.getItem(`apikey_${appId}`) ?? '';

		const res = await fetch(`/api/apps/${appId}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: req, userApiKey: storedKey || undefined, subPath })
			});

			if (res.status === 402) {
				const data = await res.json().catch(() => ({})) as { message?: string; spend?: number; limit?: number };
				cutoffInfo = { message: data.message ?? 'Spend limit reached.', spend: data.spend ?? 0, limit: data.limit ?? 0 };
				// Remove user message we just added since request didn't go through
				history = history.slice(0, -1);
				return;
			}

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error((err as { error?: string }).error ?? `Server error ${res.status}`);
			}

			const data = await res.json();

			if (data.type === 'job' && data.jobId) {
				// Background job
				const jobId: string = data.jobId;
				history = [
					...history,
					{ type: 'update-ref', jobId, summary: 'Update queued…' }
				];
				activeJob = { jobId, status: 'pending', progress: 'Queued…' };
				await scrollToBottom();
				startPolling(jobId);
			} else if (data.type === 'chat') {
				// Chat response with optional credentials
				if (data.credentials?.length) {
					for (const cred of data.credentials as Array<{ service_name: string; credential_value: string; credential_type: string }>) {
						localStorage.setItem(
							`credential_${cred.service_name}`,
							JSON.stringify({ value: cred.credential_value, type: cred.credential_type })
						);
					}
					// Reload the iframe so the app picks up the new credentials
					const iframe = document.querySelector('iframe');
					if (iframe) iframe.src = iframe.src;
				}
				history = [...history, { type: 'assistant', text: data.text }];
				await scrollToBottom();
			}
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Something went wrong';
		} finally {
			sending = false;
			await tick();
			textarea?.focus();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			send();
		}
	}

	function openPanel() {
		open = true;
		tick().then(scrollToBottom);
	}

	function saveApiKey() {
		const key = userApiKey.trim();
		if (!key) return;
		sessionStorage.setItem(`apikey_${appId}`, key);
		cutoffInfo = null;
		showApiKeyInput = false;
		tick().then(() => textarea?.focus());
	}

	async function logout() {
		await fetch(`/api/apps/${appId}/users`, { method: 'DELETE' });
		window.location.reload();
	}
</script>

<!-- Floating button -->
{#if !open}
	<button class="fab" onclick={openPanel} aria-label="Open edit chat">
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
		</svg>
		<span>Edit</span>
	</button>
{/if}

<!-- Chat panel -->
{#if open}
	<div class="panel">
		<div class="panel-header">
			<span>Edit this app</span>
			<div class="header-actions">
				<button class="logout-btn" onclick={logout}>Sign out</button>
				<button class="close" onclick={() => (open = false)} aria-label="Close">✕</button>
			</div>
		</div>

		<!-- Spend cutoff banner -->
		{#if cutoffInfo}
			<div class="cutoff-banner">
				<p class="cutoff-msg">{cutoffInfo.message}</p>
				{#if cutoffInfo.limit > 0}
					<p class="cutoff-sub">Spent: ${cutoffInfo.spend.toFixed(4)} / Limit: ${cutoffInfo.limit.toFixed(2)}</p>
				{/if}
				{#if !showApiKeyInput}
					<button class="cutoff-key-btn" onclick={() => (showApiKeyInput = true)}>
						Use my own Anthropic API key
					</button>
				{:else}
					<div class="api-key-form">
						<input
							type="password"
							bind:value={userApiKey}
							placeholder="sk-ant-…"
							class="api-key-input"
						/>
						<button class="btn-save-key" onclick={saveApiKey} disabled={!userApiKey.trim()}>
							Save & continue
						</button>
					</div>
					<p class="api-key-hint">Stored in this browser tab only — never sent to anyone else.</p>
				{/if}
			</div>
		{/if}

		<!-- Active job status bar -->
		{#if activeJob}
			<div class="status-bar {activeJob.status}">
				{#if activeJob.status === 'pending' || activeJob.status === 'running'}
					<div class="spinner"></div>
				{:else if activeJob.status === 'done'}
					<span>✓</span>
				{:else if activeJob.status === 'error'}
					<span>⚠</span>
				{/if}
				<span>{activeJob.progress}</span>
			</div>
		{/if}

		<!-- Conversation history -->
		<div class="history" bind:this={historyDiv}>
			{#if history.length === 0}
				<div class="empty-hint">
					<p>Describe what you'd like to change. Claude will update the app for you.</p>
					<p class="hint-sub">Examples: "Add a search bar", "Make it dark mode", "Show totals"</p>
					<p class="hint-sub">Use "Sign out" in the header to log out of this app.</p>
				</div>
			{/if}
			{#each history as msg}
				{#if msg.type === 'user'}
					<div class="bubble user">{msg.text}</div>
				{:else if msg.type === 'assistant'}
					<div class="bubble assistant">
						{msg.text}
						{#if msg.streaming}
							<span class="cursor">▋</span>
						{/if}
					</div>
				{:else if msg.type === 'update-ref'}
					<div class="update-ref">
						{#if activeJob?.jobId === msg.jobId && (activeJob.status === 'pending' || activeJob.status === 'running')}
							<div class="spinner small"></div>
						{/if}
						<span>{msg.summary}</span>
					</div>
				{/if}
			{/each}

			{#if errorMsg}
				<div class="bubble error">⚠ {errorMsg}</div>
			{/if}
		</div>

		<!-- Input area -->
		<div class="panel-footer">
			<textarea
				bind:this={textarea}
				bind:value={message}
				oninput={resize}
				onkeydown={handleKeydown}
				placeholder="Describe your edit request…"
				rows="2"
				disabled={sending}
			></textarea>
			<button
				class="send-btn"
				onclick={send}
				disabled={!message.trim() || sending}
				aria-label="Send message"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
					<path d="M2 21L23 12 2 3v7l15 2-15 2v7z"/>
				</svg>
			</button>
		</div>
		<p class="shortcut-hint">⌘↵ to send</p>
	</div>
{/if}

<style>
	.fab {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: #4f46e5;
		color: #fff;
		border: none;
		border-radius: 100px;
		padding: 0.7rem 1.1rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		box-shadow: 0 4px 20px rgba(79,70,229,.4);
		z-index: 1000;
		transition: transform 0.15s, box-shadow 0.15s;
	}

	.fab:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 24px rgba(79,70,229,.5);
	}

	.panel {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		width: 480px;
		max-height: 640px;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 16px;
		box-shadow: 0 12px 48px rgba(0,0,0,.18);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.9rem 1.1rem;
		border-bottom: 1px solid #f3f4f6;
		font-weight: 600;
		font-size: 0.9rem;
		background: #fafafa;
		flex-shrink: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.logout-btn {
		background: none;
		border: none;
		font-size: 0.75rem;
		cursor: pointer;
		color: #9ca3af;
		padding: 0.15rem 0.35rem;
		border-radius: 4px;
	}

	.logout-btn:hover { color: #b91c1c; background: #fef2f2; }

	.close {
		background: none;
		border: none;
		font-size: 1rem;
		cursor: pointer;
		color: #9ca3af;
		padding: 0 0.2rem;
	}

	.close:hover { color: #111; }

	/* Status bar */
	.status-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 1.1rem;
		font-size: 0.8rem;
		font-weight: 500;
		flex-shrink: 0;
		border-bottom: 1px solid #f3f4f6;
	}

	.status-bar.pending,
	.status-bar.running {
		background: #f5f3ff;
		color: #6d28d9;
	}

	.status-bar.done { background: #f0fdf4; color: #15803d; }
	.status-bar.error { background: #fef2f2; color: #b91c1c; }

	/* Conversation history */
	.history {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.empty-hint {
		color: #6b7280;
		font-size: 0.875rem;
	}

	.hint-sub {
		font-size: 0.78rem;
		color: #9ca3af;
		font-style: italic;
		margin-top: 0.35rem;
	}

	.bubble {
		max-width: 90%;
		padding: 0.6rem 0.85rem;
		border-radius: 12px;
		font-size: 0.875rem;
		line-height: 1.45;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.bubble.user {
		background: #4f46e5;
		color: #fff;
		align-self: flex-end;
		border-bottom-right-radius: 4px;
	}

	.bubble.assistant {
		background: #f3f4f6;
		color: #111827;
		align-self: flex-start;
		border-bottom-left-radius: 4px;
	}

	.bubble.error {
		background: #fef2f2;
		color: #b91c1c;
		align-self: flex-start;
		border-radius: 8px;
	}

	.cursor {
		animation: blink 0.8s step-end infinite;
		font-family: monospace;
	}

	@keyframes blink {
		50% { opacity: 0; }
	}

	.update-ref {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		align-self: flex-start;
		font-size: 0.8rem;
		color: #6d28d9;
		background: #f5f3ff;
		padding: 0.4rem 0.75rem;
		border-radius: 8px;
	}

	/* Spinner */
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid #c4b5fd;
		border-top-color: #7c3aed;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}

	.spinner.small {
		width: 12px;
		height: 12px;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	/* Input footer */
	.panel-footer {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		padding: 0.75rem 1rem 0.5rem;
		border-top: 1px solid #f3f4f6;
		flex-shrink: 0;
	}

	textarea {
		flex: 1;
		resize: none;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		padding: 0.55rem 0.75rem;
		font-size: 0.875rem;
		font-family: inherit;
		line-height: 1.4;
		min-height: 40px;
		max-height: 160px;
	}

	textarea:focus {
		outline: none;
		border-color: #4f46e5;
		box-shadow: 0 0 0 2px #e0e7ff;
	}

	.send-btn {
		background: #4f46e5;
		color: #fff;
		border: none;
		border-radius: 8px;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
		transition: background 0.15s;
	}

	.send-btn:hover { background: #4338ca; }
	.send-btn:disabled { background: #c7d2fe; cursor: not-allowed; }

	.shortcut-hint {
		text-align: right;
		font-size: 0.72rem;
		color: #d1d5db;
		padding: 0 1rem 0.5rem;
		flex-shrink: 0;
	}

	/* Cutoff banner */
	.cutoff-banner {
		background: #fef9c3;
		border-bottom: 1px solid #fde68a;
		padding: 0.75rem 1.1rem;
		flex-shrink: 0;
	}

	.cutoff-msg {
		font-size: 0.8rem;
		font-weight: 600;
		color: #92400e;
		margin-bottom: 0.15rem;
	}

	.cutoff-sub {
		font-size: 0.75rem;
		color: #a16207;
		margin-bottom: 0.45rem;
	}

	.cutoff-key-btn {
		background: none;
		border: 1px solid #d97706;
		color: #92400e;
		padding: 0.3rem 0.65rem;
		border-radius: 6px;
		font-size: 0.78rem;
		cursor: pointer;
	}

	.cutoff-key-btn:hover { background: #fde68a; }

	.api-key-form {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.3rem;
	}

	.api-key-input {
		flex: 1;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		font-size: 0.8rem;
		font-family: monospace;
		min-width: 0;
	}

	.api-key-input:focus {
		outline: none;
		border-color: #4f46e5;
		box-shadow: 0 0 0 2px #e0e7ff;
	}

	.btn-save-key {
		background: #4f46e5;
		color: #fff;
		border: none;
		border-radius: 6px;
		padding: 0.35rem 0.7rem;
		font-size: 0.78rem;
		cursor: pointer;
		white-space: nowrap;
	}

	.btn-save-key:disabled { background: #c7d2fe; cursor: not-allowed; }

	.api-key-hint {
		font-size: 0.72rem;
		color: #a16207;
		margin-top: 0.3rem;
	}

	@media (max-width: 520px) {
		.panel { width: calc(100vw - 2rem); right: 1rem; }
	}
</style>
