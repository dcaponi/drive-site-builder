<script lang="ts">
	import type { PageData } from './$types';
	import type { ConversationFeedback } from '$lib/server/sheets.js';

	let { data }: { data: PageData } = $props();

	let building = $state(false);
	let buildLog = $state('');
	let buildError = $state('');
	let logDiv: HTMLDivElement | undefined = $state();
	let feedbacks = $state<ConversationFeedback[]>([...data.feedbacks]);

	// Credentials state
	let credOwners = $state((data.app.app_owners ?? []).join('\n'));
	let credDomains = $state((data.app.allowed_domains ?? []).join('\n'));
	let credPassword = $state('');
	let credSaving = $state(false);
	let credError = $state('');
	let credSuccess = $state('');
	let magicLink = $state('');
	let magicLinkCopied = $state(false);
	let credentialsActive = $state(!!(data.app.app_owners?.length));

	// Spend control state
	let spendLimit = $state(String(data.app.spend_limit_usd ?? 0));
	let isCutoff = $state(data.app.is_cutoff ?? false);
	let spendSaving = $state(false);
	let spendError = $state('');
	let spendSuccess = $state('');

	$effect(() => {
		if (buildLog && logDiv) {
			logDiv.scrollTop = logDiv.scrollHeight;
		}
	});

	async function triggerBuild() {
		building = true;
		buildLog = '';
		buildError = '';

		try {
			const res = await fetch(`/api/apps/${data.app.id}/build`, { method: 'POST' });
			if (!res.ok || !res.body) throw new Error(await res.text());

			const reader = res.body.getReader();
			const dec = new TextDecoder();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buildLog += dec.decode(value);
			}

			// Refresh page to show updated state
			window.location.reload();
		} catch (err) {
			buildError = err instanceof Error ? err.message : 'Build failed';
		} finally {
			building = false;
		}
	}

	async function deleteFeedback(id: string) {
		const res = await fetch(`/api/apps/${data.app.id}/feedback/${id}`, { method: 'DELETE' });
		if (res.ok) {
			feedbacks = feedbacks.filter((f) => f.id !== id);
		}
	}

	async function saveCredentials() {
		credSaving = true;
		credError = '';
		credSuccess = '';
		magicLink = '';

		try {
			const res = await fetch(`/api/apps/${data.app.id}/credentials`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					owners: credOwners.split('\n').map((e) => e.trim()).filter(Boolean),
					password: credPassword,
					allowed_domains: credDomains.split('\n').map((d) => d.trim()).filter(Boolean)
				})
			});
			if (!res.ok) throw new Error(await res.text());
			credSuccess = 'Credentials saved.';
			credPassword = '';
			credentialsActive = true;
			// Auto-generate magic link
			await generateMagicLink();
		} catch (err) {
			credError = err instanceof Error ? err.message : 'Failed to save';
		} finally {
			credSaving = false;
		}
	}

	async function clearCredentials() {
		if (!confirm('Remove credentials? The app will be accessible to anyone with a Google account.')) return;
		credSaving = true;
		credError = '';
		credSuccess = '';
		magicLink = '';

		try {
			const res = await fetch(`/api/apps/${data.app.id}/credentials`, { method: 'DELETE' });
			if (!res.ok) throw new Error(await res.text());
			credOwners = '';
			credPassword = '';
			credentialsActive = false;
			credSuccess = 'Credentials removed.';
		} catch (err) {
			credError = err instanceof Error ? err.message : 'Failed to clear';
		} finally {
			credSaving = false;
		}
	}

	async function generateMagicLink() {
		credError = '';
		try {
			const res = await fetch(`/api/apps/${data.app.id}/token`, { method: 'POST' });
			if (!res.ok) throw new Error(await res.text());
			const body = await res.json();
			magicLink = body.magicLink;
		} catch (err) {
			credError = err instanceof Error ? err.message : 'Failed to generate link';
		}
	}

	async function copyMagicLink() {
		await navigator.clipboard.writeText(magicLink);
		magicLinkCopied = true;
		setTimeout(() => (magicLinkCopied = false), 2000);
	}

	async function saveSpend() {
		spendSaving = true;
		spendError = '';
		spendSuccess = '';
		try {
			const res = await fetch(`/api/apps/${data.app.id}/spend`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					spend_limit_usd: parseFloat(spendLimit) || 0,
					is_cutoff: isCutoff
				})
			});
			if (!res.ok) throw new Error(await res.text());
			spendSuccess = 'Spend settings saved.';
		} catch (err) {
			spendError = err instanceof Error ? err.message : 'Failed to save';
		} finally {
			spendSaving = false;
		}
	}
</script>

<div class="app-header">
	<div>
		<a href="/dashboard" class="back">← Dashboard</a>
		<h1>{data.app.name}</h1>
		{#if data.app.last_built_at}
			<p class="meta">Last built {new Date(data.app.last_built_at).toLocaleString()}</p>
		{/if}
	</div>
	<div class="actions">
		{#if data.app.generated_code_doc_id}
			<a href="/serve/{data.app.id}" target="_blank" class="btn-outline">Open App ↗</a>
		{/if}
		<button class="btn-primary" onclick={triggerBuild} disabled={building}>
			{building ? 'Building…' : data.app.generated_code_doc_id ? 'Rebuild' : 'Build App'}
		</button>
	</div>
</div>

{#if buildError}
	<div class="banner error">{buildError}</div>
{/if}

{#if building}
	<div class="build-log" bind:this={logDiv}>
		<p class="log-label">Generating code with Claude…</p>
		<pre>{buildLog || '▋'}</pre>
	</div>
{/if}

<div class="two-col">
	<section class="card">
		<h2>Requirements</h2>
		<pre class="content-preview">{data.requirements || 'No requirements doc found.'}</pre>
	</section>

	<section class="card">
		<h2>Database Schema</h2>
		{#if data.schema.length === 0}
			<p class="muted">No tables found in the database sheet.</p>
		{:else}
			{#each data.schema as table}
				<div class="table-schema">
					<strong>{table.name}</strong>
					<ul>
						{#each table.columns as col}
							<li><code>{col.name}</code> <span class="type">{col.type}</span></li>
						{/each}
					</ul>
				</div>
			{/each}
		{/if}
	</section>
</div>

<!-- Live Preview (iframe) -->
{#if data.app.generated_code_doc_id}
	<section class="preview-section">
		<h2>Live Preview</h2>
		<div class="iframe-wrapper">
			<iframe src="/serve/{data.app.id}/content" title="{data.app.name} preview" loading="lazy"></iframe>
		</div>
	</section>
{/if}

<!-- Access / Credentials -->
<section class="card credentials-section">
	<h2>Access Control</h2>

	{#if credError}
		<div class="banner error small">{credError}</div>
	{/if}
	{#if credSuccess}
		<div class="banner success small">{credSuccess}</div>
	{/if}

	<p class="muted" style="margin-bottom:1rem;">
		{#if credentialsActive}
			This app requires a password.
			App-owners who can edit via chat: <strong>{(data.app.app_owners ?? []).join(', ') || 'none'}</strong>
		{:else}
			No credentials set — anyone with Google access can view this app.
		{/if}
	</p>

	<div class="cred-form">
		<label class="cred-label">
			App-owner emails <span class="cred-hint">(one per line — these users see the chat bubble)</span>
			<textarea bind:value={credOwners} placeholder="alice@example.com&#10;bob@example.com" rows="3"></textarea>
		</label>
		<label class="cred-label">
			Allowed email domains <span class="cred-hint">(one per line — only these domains can sign up; leave blank to allow anyone)</span>
			<textarea bind:value={credDomains} placeholder="company.com&#10;example.org" rows="2"></textarea>
		</label>
		<label class="cred-label">
			Password
			<input type="password" bind:value={credPassword} placeholder="Password" />
		</label>
		<div class="cred-actions">
			<button class="btn-primary small" onclick={saveCredentials} disabled={credSaving || !credPassword}>
				{credSaving ? 'Saving…' : 'Save credentials'}
			</button>
			{#if credentialsActive}
				<button class="btn-ghost small" onclick={clearCredentials} disabled={credSaving}>Remove</button>
			{/if}
		</div>
	</div>

	{#if credentialsActive}
		<div class="magic-link-area">
			<p class="magic-label">Magic link <span class="badge-muted">anyone with this link can access</span></p>
			{#if magicLink}
				<div class="magic-link-row">
					<input type="text" readonly value={magicLink} class="magic-input" />
					<button class="btn-primary small" onclick={copyMagicLink}>
						{magicLinkCopied ? 'Copied!' : 'Copy'}
					</button>
				</div>
			{:else}
				<button class="btn-outline small" onclick={generateMagicLink}>Generate magic link</button>
			{/if}
		</div>
	{/if}
</section>

<!-- Spend Control -->
<section class="card spend-section">
	<h2>
		AI Spend
		<span class="spend-badge {(data.app.is_cutoff || (data.app.spend_limit_usd > 0 && data.app.spend_usd >= data.app.spend_limit_usd)) ? 'over' : 'ok'}">
			${(data.app.spend_usd ?? 0).toFixed(4)}
		</span>
	</h2>

	{#if spendError}
		<div class="banner error small">{spendError}</div>
	{/if}
	{#if spendSuccess}
		<div class="banner success small">{spendSuccess}</div>
	{/if}

	<div class="spend-row">
		<label class="cred-label" style="flex:1">
			Spend limit (USD)
			<span class="cred-hint">0 = unlimited</span>
			<input type="number" min="0" step="0.01" bind:value={spendLimit} placeholder="0" />
		</label>
		<label class="cutoff-toggle">
			<input type="checkbox" bind:checked={isCutoff} />
			<span class="cutoff-toggle-text">Manual cutoff</span>
		</label>
	</div>
	<p class="muted" style="margin-top:0.35rem;font-size:0.78rem;">
		When cutoff is active, the chat will ask users for their own Anthropic API key.
	</p>
	<div class="cred-actions" style="margin-top:0.75rem;">
		<button class="btn-primary small" onclick={saveSpend} disabled={spendSaving}>
			{spendSaving ? 'Saving…' : 'Save spend settings'}
		</button>
	</div>
</section>

<!-- Edit history / feedbacks -->
{#if feedbacks.length > 0}
	<section class="card feedback-section">
		<h2>Edit History <span class="badge">{feedbacks.length}</span></h2>
		<ul class="feedback-list">
			{#each feedbacks as fb (fb.id)}
				<li class="feedback-item">
					<div class="fb-content">
						<span class="fb-summary">{fb.summary}</span>
						{#if fb.created_at}
							<span class="fb-date">{new Date(fb.created_at).toLocaleString()}</span>
						{/if}
					</div>
					<button
						class="fb-delete"
						onclick={() => deleteFeedback(fb.id)}
						aria-label="Delete feedback"
					>✕</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.app-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 2rem;
		gap: 1rem;
	}

	.back { font-size: 0.875rem; color: #6b7280; display: block; margin-bottom: 0.3rem; }
	h1 { font-size: 1.75rem; font-weight: 700; }
	.meta { font-size: 0.8rem; color: #9ca3af; margin-top: 0.2rem; }

	.actions { display: flex; gap: 0.75rem; align-items: center; flex-shrink: 0; }

	.btn-primary {
		background: #4f46e5;
		color: #fff;
		border: none;
		padding: 0.65rem 1.25rem;
		border-radius: 8px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
	}

	.btn-primary.small { padding: 0.45rem 0.9rem; font-size: 0.825rem; }
	.btn-primary:hover { background: #4338ca; }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

	.btn-outline {
		border: 1px solid #d1d5db;
		padding: 0.65rem 1.25rem;
		border-radius: 8px;
		font-size: 0.9rem;
		color: #374151;
		text-decoration: none;
		background: #fff;
		cursor: pointer;
	}

	.btn-outline.small { padding: 0.45rem 0.9rem; font-size: 0.825rem; }
	.btn-outline:hover { background: #f9fafb; }

	.btn-ghost {
		border: 1px solid #d1d5db;
		background: none;
		padding: 0.65rem 1.25rem;
		border-radius: 8px;
		font-size: 0.9rem;
		color: #374151;
		cursor: pointer;
	}

	.btn-ghost.small { padding: 0.45rem 0.9rem; font-size: 0.825rem; }
	.btn-ghost:hover { background: #f9fafb; }

	.banner {
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
	}

	.banner.small { margin-bottom: 0.75rem; }
	.banner.error { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; }
	.banner.success { background: #f0fdf4; border: 1px solid #86efac; color: #15803d; }

	.build-log {
		background: #1e1e2e;
		border-radius: 8px;
		padding: 1rem 1.25rem;
		margin-bottom: 1.5rem;
		max-height: 200px;
		overflow: auto;
	}

	.log-label { color: #7c3aed; font-size: 0.8rem; margin-bottom: 0.5rem; }

	.build-log pre {
		color: #a6e3a1;
		font-size: 0.78rem;
		white-space: pre-wrap;
		word-break: break-all;
		font-family: 'Fira Code', monospace;
	}

	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
		margin-bottom: 1.5rem;
	}

	@media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } }

	.card {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 1.5rem;
	}

	.card h2 { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #374151; }

	.content-preview {
		font-size: 0.8rem;
		white-space: pre-wrap;
		word-break: break-word;
		color: #4b5563;
		max-height: 300px;
		overflow-y: auto;
		font-family: inherit;
	}

	.table-schema { margin-bottom: 1rem; }
	.table-schema strong { font-size: 0.875rem; }
	.table-schema ul { margin-top: 0.35rem; padding-left: 1rem; list-style: none; }
	.table-schema li { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.15rem; }
	.table-schema code { color: #1d4ed8; font-size: 0.8rem; }
	.table-schema .type { color: #9ca3af; margin-left: 0.4rem; }

	.muted { font-size: 0.875rem; color: #9ca3af; }

	.preview-section { margin-top: 1rem; margin-bottom: 1.5rem; }
	.preview-section h2 { font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem; color: #374151; }

	.iframe-wrapper {
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		overflow: hidden;
		height: 600px;
	}

	iframe {
		width: 100%;
		height: 100%;
		border: none;
	}

	/* Credentials section */
	.credentials-section { margin-top: 1rem; margin-bottom: 1.5rem; }

	.cred-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.cred-label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: #374151;
	}

	.cred-label input,
	.cred-label textarea {
		padding: 0.5rem 0.65rem;
		border: 1px solid #d1d5db;
		border-radius: 7px;
		font-size: 0.875rem;
		font-family: inherit;
		resize: vertical;
	}

	.cred-label input:focus,
	.cred-label textarea:focus {
		outline: none;
		border-color: #4f46e5;
		box-shadow: 0 0 0 2px #e0e7ff;
	}

	.cred-hint {
		font-weight: 400;
		color: #9ca3af;
		font-size: 0.75rem;
	}

	.cred-actions { display: flex; gap: 0.5rem; margin-top: 0.25rem; }

	.magic-link-area { margin-top: 1.25rem; }

	.magic-label {
		font-size: 0.8rem;
		font-weight: 500;
		color: #374151;
		margin-bottom: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.badge-muted {
		background: #f3f4f6;
		color: #6b7280;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 400;
		padding: 0.1rem 0.5rem;
	}

	.magic-link-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.magic-input {
		flex: 1;
		padding: 0.45rem 0.65rem;
		border: 1px solid #d1d5db;
		border-radius: 7px;
		font-size: 0.8rem;
		font-family: monospace;
		color: #4b5563;
		background: #f9fafb;
		min-width: 0;
	}

	/* Spend section */
	.spend-section { margin-top: 1rem; margin-bottom: 1.5rem; }

	.spend-badge {
		display: inline-block;
		font-size: 0.8rem;
		font-weight: 500;
		padding: 0.1rem 0.55rem;
		border-radius: 999px;
		margin-left: 0.5rem;
		vertical-align: middle;
	}

	.spend-badge.ok { background: #f0fdf4; color: #15803d; }
	.spend-badge.over { background: #fef2f2; color: #b91c1c; }

	.spend-row {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
		margin-top: 0.5rem;
	}

	.cutoff-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		white-space: nowrap;
		padding-bottom: 0.55rem;
		cursor: pointer;
	}

	.cutoff-toggle input[type='checkbox'] { width: 1rem; height: 1rem; cursor: pointer; }

	/* Feedback section */
	.feedback-section { margin-top: 1rem; }

	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: #e0e7ff;
		color: #4f46e5;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 600;
		padding: 0.1rem 0.5rem;
		margin-left: 0.4rem;
		vertical-align: middle;
	}

	.feedback-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.feedback-item {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0.75rem;
		background: #f9fafb;
		border: 1px solid #f3f4f6;
		border-radius: 8px;
	}

	.fb-content {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.fb-summary {
		font-size: 0.875rem;
		color: #374151;
	}

	.fb-date {
		font-size: 0.72rem;
		color: #9ca3af;
	}

	.fb-delete {
		background: none;
		border: none;
		color: #d1d5db;
		font-size: 0.85rem;
		cursor: pointer;
		padding: 0.1rem 0.3rem;
		border-radius: 4px;
		flex-shrink: 0;
		line-height: 1;
	}

	.fb-delete:hover { background: #fee2e2; color: #b91c1c; }
</style>
