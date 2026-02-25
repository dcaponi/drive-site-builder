<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showRegisterModal = $state(false);
	let showCreateModal = $state(false);
	let selectedFolderId = $state('');
	let customName = $state('');
	let newAppName = $state('');
	let newClientName = $state('');
	let registerClientName = $state('');
	let submitting = $state(false);

	function appPublicUrl(app: typeof data.apps[0]): string {
		if (app.is_home) return '/';
		if (app.client_slug && app.app_slug) return `/${app.client_slug}/${app.app_slug}`;
		return '';
	}

	function pickFolder(id: string, name: string) {
		selectedFolderId = id;
		customName = name;
	}
</script>

<div class="header">
	<div>
		<h1>Your Apps</h1>
		{#if data.rootFolderName}
			<p class="root-label">Drive root: 📁 {data.rootFolderName}</p>
		{/if}
	</div>
	<div class="header-actions">
		<button class="btn-primary" onclick={() => (showCreateModal = true)}>+ Create New App</button>
		<button class="btn-ghost" onclick={() => (showRegisterModal = true)}>Register Existing</button>
		{#if data.apps.some((a) => !a.app_slug)}
			<form method="POST" action="?/migrateApps" use:enhance>
				<button type="submit" class="btn-ghost migrate">Backfill Slugs</button>
			</form>
		{/if}
	</div>
</div>

{#if form?.migrated !== undefined}
	<div class="banner success">Backfilled slugs for {form.migrated} app{form.migrated === 1 ? '' : 's'}.</div>
{/if}

{#if data.driveError}
	<div class="banner error">
		<strong>Google Drive error:</strong> {data.driveError}
		<br /><a href="/auth/logout" style="color:inherit;text-decoration:underline">Sign out and try again →</a>
	</div>
{/if}

{#if data.apps.length === 0}
	<div class="empty">
		<p>No apps registered yet.</p>
		<p>Create a folder in your Google Drive with a requirements doc and a database spreadsheet, then register it here.</p>
	</div>
{/if}

<div class="grid">
	{#each data.apps as app}
		<a href="/app/{app.id}" class="card">
			<div class="card-icon">🌐</div>
			<div class="card-body">
				<h2>{app.name}</h2>
				<p class="meta">
					{#if app.last_built_at}
						Last built {new Date(app.last_built_at).toLocaleDateString()}
					{:else}
						Not yet built
					{/if}
				</p>
				{#if appPublicUrl(app)}
					<p class="meta url-badge">
						{#if app.is_home}
							<span class="badge-home">Home</span>
						{/if}
						<code>{appPublicUrl(app)}</code>
					</p>
				{/if}
				{#if (app.spend_usd ?? 0) > 0 || (app.spend_limit_usd ?? 0) > 0 || app.is_cutoff}
					<p class="meta spend {app.is_cutoff ? 'cutoff' : ''}">
						${(app.spend_usd ?? 0).toFixed(4)} spent{app.spend_limit_usd > 0 ? ` / $${app.spend_limit_usd.toFixed(2)} limit` : ''}{app.is_cutoff ? ' · cutoff' : ''}
					</p>
				{/if}
			</div>
			<div class="card-right">
				<div class="card-status {app.generated_code_doc_id ? 'live' : 'pending'}">
					{app.generated_code_doc_id ? 'Live' : 'Pending'}
				</div>
				{#if !app.client_slug && !app.is_home}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<form method="POST" action="?/setHome" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
						<input type="hidden" name="app_id" value={app.id} />
						<button type="submit" class="btn-set-home">Set Home</button>
					</form>
				{/if}
			</div>
		</a>
	{/each}
</div>

<!-- Create Modal -->
{#if showCreateModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop"
		onclick={() => (showCreateModal = false)}
		onkeydown={(e) => e.key === 'Escape' && (showCreateModal = false)}
	>
		<div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create App">
			<h2>Create New App</h2>
			<p class="modal-hint">
				We'll create a Google Drive folder with a requirements doc and a blank database sheet for you.
			</p>

			{#if form?.error && form?.created === undefined}
				<div class="error">{form.error}</div>
			{/if}

			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						await update();
						if (!form?.error) showCreateModal = false;
					};
				}}
			>
				<div class="field">
					<label for="create_name">App name <span class="req">*</span></label>
					<input
						id="create_name"
						name="name"
						type="text"
						placeholder="My App"
						bind:value={newAppName}
						required
					/>
				</div>
				<div class="field">
					<label for="create_client">Client name</label>
					<input
						id="create_client"
						name="client_name"
						type="text"
						placeholder="(optional) e.g. Acme Corp"
						bind:value={newClientName}
					/>
					<small>If set, the app will live at /<em>client-slug</em>/<em>app-slug</em></small>
				</div>
				<div class="modal-actions">
					<button type="button" class="btn-ghost" onclick={() => (showCreateModal = false)}>
						Cancel
					</button>
					<button type="submit" class="btn-primary" disabled={submitting || !newAppName.trim()}>
						{submitting ? 'Creating…' : 'Create App'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Register Modal -->
{#if showRegisterModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop"
		onclick={() => (showRegisterModal = false)}
		onkeydown={(e) => e.key === 'Escape' && (showRegisterModal = false)}
	>
		<div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Register App">
			<h2>Register a Drive Folder</h2>
			<p class="modal-hint">
				The folder must contain at least one Google Doc (requirements) and one Google Sheet (database).
			</p>

			{#if form?.error}
				<div class="error">{form.error}</div>
			{/if}

			{#if data.folders.length > 0}
				<div class="folder-list">
					<p class="label">Folders in your Drive root:</p>
					{#each data.folders as folder}
						<button
							type="button"
							class="folder-item {selectedFolderId === folder.id ? 'selected' : ''}"
							onclick={() => pickFolder(folder.id, folder.name)}
						>
							📁 {folder.name}
						</button>
					{/each}
				</div>
			{/if}

			<form
				method="POST"
				action="?/register"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						await update();
						if (!form?.error) showRegisterModal = false;
					};
				}}
			>
				<div class="field">
					<label for="folder_id">Folder ID <span class="req">*</span></label>
					<input
						id="folder_id"
						name="folder_id"
						type="text"
						placeholder="Paste Google Drive folder ID"
						bind:value={selectedFolderId}
						required
					/>
					<small>Found in the URL: drive.google.com/drive/folders/<strong>THIS_PART</strong></small>
				</div>
				<div class="field">
					<label for="folder_name">App name</label>
					<input
						id="folder_name"
						name="folder_name"
						type="text"
						placeholder="My App"
						bind:value={customName}
					/>
				</div>
				<div class="field">
					<label for="register_client">Client name</label>
					<input
						id="register_client"
						name="client_name"
						type="text"
						placeholder="(optional) e.g. Acme Corp"
						bind:value={registerClientName}
					/>
					<small>If set, the app will live at /<em>client-slug</em>/<em>app-slug</em></small>
				</div>
				<div class="modal-actions">
					<button type="button" class="btn-ghost" onclick={() => (showRegisterModal = false)}>
						Cancel
					</button>
					<button type="submit" class="btn-primary" disabled={submitting}>
						{submitting ? 'Registering…' : 'Register'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2rem;
	}

	h1 { font-size: 1.75rem; font-weight: 700; }
	.root-label { font-size: 0.8rem; color: #9ca3af; margin-top: 0.2rem; }

	.header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.btn-primary {
		background: #4f46e5;
		color: #fff;
		border: none;
		padding: 0.6rem 1.2rem;
		border-radius: 8px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
	}

	.btn-primary:hover { background: #4338ca; }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

	.banner {
		padding: 0.85rem 1rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.banner.error { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; }
	.banner.success { background: #f0fdf4; border: 1px solid #86efac; color: #15803d; }
	.migrate { font-size: 0.8rem; padding: 0.4rem 0.8rem; color: #6b7280; }

	.btn-ghost {
		background: none;
		border: 1px solid #d1d5db;
		padding: 0.6rem 1.2rem;
		border-radius: 8px;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.empty {
		text-align: center;
		padding: 4rem 2rem;
		color: #6b7280;
		background: #fff;
		border: 2px dashed #e5e7eb;
		border-radius: 12px;
	}

	.empty p + p { margin-top: 0.5rem; font-size: 0.875rem; }

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.25rem;
	}

	.card {
		display: flex;
		align-items: center;
		gap: 1rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 1.25rem;
		text-decoration: none;
		color: inherit;
		transition: box-shadow 0.15s, border-color 0.15s;
	}

	.card:hover {
		box-shadow: 0 4px 16px rgba(0,0,0,.08);
		border-color: #c7d2fe;
	}

	.card-icon { font-size: 2rem; }

	.card-body { flex: 1; min-width: 0; }
	.card-body h2 { font-size: 1rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.card-body .meta { font-size: 0.8rem; color: #9ca3af; margin-top: 0.2rem; }
	.meta.spend { color: #6b7280; }
	.meta.spend.cutoff { color: #b91c1c; font-weight: 500; }

	.card-right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.card-status {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.2rem 0.6rem;
		border-radius: 100px;
	}

	.card-status.live { background: #dcfce7; color: #15803d; }
	.card-status.pending { background: #fef9c3; color: #854d0e; }

	.url-badge { display: flex; align-items: center; gap: 0.35rem; }
	.url-badge code { font-size: 0.75rem; color: #4f46e5; background: #eef2ff; padding: 0.1rem 0.4rem; border-radius: 4px; }
	.badge-home { font-size: 0.7rem; font-weight: 600; background: #dcfce7; color: #15803d; padding: 0.1rem 0.4rem; border-radius: 4px; }

	.btn-set-home {
		font-size: 0.7rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		background: none;
		cursor: pointer;
		color: #6b7280;
		white-space: nowrap;
	}
	.btn-set-home:hover { background: #f0fdf4; border-color: #86efac; color: #15803d; }

	/* Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
	}

	.modal {
		background: #fff;
		border-radius: 12px;
		padding: 2rem;
		width: 100%;
		max-width: 500px;
		max-height: 90vh;
		overflow-y: auto;
	}

	.modal h2 { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem; }
	.modal-hint { font-size: 0.875rem; color: #6b7280; margin-bottom: 1.5rem; }

	.folder-list { margin-bottom: 1.5rem; }
	.label { font-size: 0.8rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; }

	.folder-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.5rem 0.75rem;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		background: none;
		cursor: pointer;
		font-size: 0.875rem;
		margin-bottom: 0.35rem;
	}

	.folder-item.selected { border-color: #4f46e5; background: #eef2ff; }
	.folder-item:hover { background: #f9fafb; }

	.field { margin-bottom: 1rem; }
	.field label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.35rem; }
	.field input {
		width: 100%;
		padding: 0.6rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
	}

	.field input:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 2px #e0e7ff; }
	.field small { font-size: 0.78rem; color: #9ca3af; }

	.req { color: #ef4444; }

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.error {
		background: #fef2f2;
		border: 1px solid #fca5a5;
		color: #b91c1c;
		border-radius: 6px;
		padding: 0.65rem 0.9rem;
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}
</style>
