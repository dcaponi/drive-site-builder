export interface AppConfig {
	id: string;
	name: string;
	folder_id: string;
	requirements_doc_id: string;
	database_sheet_id: string;
	generated_code_doc_id: string;
	created_at: string;
	updated_at: string;
	last_built_at: string;
	app_owners: string[];
	allowed_domains: string[];
	app_password: string;
	spend_usd: number;
	spend_limit_usd: number;
	is_cutoff: boolean;
	client_slug: string;
	app_slug: string;
	is_home: boolean;
}

export interface TableSchema {
	name: string;
	columns: ColumnDef[];
}

export interface ColumnDef {
	name: string;
	type: 'string' | 'number' | 'boolean' | 'date' | 'unknown';
}

export interface CrudRecord {
	id: string;
	[key: string]: unknown;
}

export interface Conversation {
	id: string;
	app_id: string;
	role: 'user' | 'assistant';
	message: string;
	summary: string;
	created_at: string;
}

export interface BuildResult {
	success: boolean;
	code?: string;
	error?: string;
}
