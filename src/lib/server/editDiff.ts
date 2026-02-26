// ─── Diff-based editing utilities ────────────────────────────────────────────
// Parses Aider-style search/replace blocks and applies them to source code.
// Format:
//   <<<<<<< SEARCH
//   (exact text to find)
//   =======
//   (replacement text)
//   >>>>>>> REPLACE

export interface EditBlock {
	search: string;
	replace: string;
}

/**
 * Parse all SEARCH/REPLACE blocks out of a Claude response.
 * Returns an empty array if none are found.
 */
export function parseEditBlocks(text: string): EditBlock[] {
	const blocks: EditBlock[] = [];
	// Allow optional carriage returns and trailing whitespace on delimiters
	const regex =
		/<<<<<<< SEARCH\r?\n([\s\S]*?)\n=======\r?\n([\s\S]*?)\n>>>>>>> REPLACE/g;
	let match;
	while ((match = regex.exec(text)) !== null) {
		blocks.push({ search: match[1], replace: match[2] });
	}
	return blocks;
}

/**
 * Returns true if the text looks like a full HTML document rather than a diff.
 */
export function isFullHtml(text: string): boolean {
	const t = text.trimStart().toLowerCase();
	return t.startsWith('<!doctype') || t.startsWith('<html');
}

/**
 * Try to replace `search` with `replace` in `code`.
 * First attempts an exact match; if that fails, falls back to a line-by-line
 * comparison that ignores leading/trailing whitespace on each line so minor
 * indentation differences don't break the match.
 * Returns null if the search text is not found.
 */
function flexibleReplace(code: string, search: string, replace: string): string | null {
	// 1. Exact match — cheapest and most reliable
	if (code.includes(search)) {
		return code.replace(search, replace);
	}

	// 2. Line-trimmed fuzzy match — handles indentation drift
	const codeLines = code.split('\n');
	const searchLines = search.trim().split('\n');
	const searchTrimmed = searchLines.map((l) => l.trim());
	const n = searchLines.length;

	for (let i = 0; i <= codeLines.length - n; i++) {
		const window = codeLines.slice(i, i + n);
		if (window.map((l) => l.trim()).join('\n') === searchTrimmed.join('\n')) {
			const before = codeLines.slice(0, i).join('\n');
			const after = codeLines.slice(i + n).join('\n');
			const parts = [];
			if (before) parts.push(before);
			if (replace) parts.push(replace);
			if (after) parts.push(after);
			return parts.join('\n');
		}
	}

	return null;
}

export interface ApplyResult {
	code: string;
	success: boolean;
	failedBlock?: EditBlock;
}

/**
 * Apply all edit blocks to `original`.
 * Returns the updated code on success, or the original + the first failing
 * block so the caller can fall back to full regeneration.
 */
/**
 * Strip any leftover SEARCH/REPLACE markers from code.
 * Keeps only the REPLACE content (the intended new code).
 */
export function stripDiffMarkers(code: string): string {
	return code
		.replace(/<<<<<<< SEARCH\r?\n[\s\S]*?\n=======\r?\n([\s\S]*?)\n>>>>>>> REPLACE/g, '$1');
}

export function applyEditBlocks(original: string, blocks: EditBlock[]): ApplyResult {
	let code = original;
	for (const block of blocks) {
		const result = flexibleReplace(code, block.search, block.replace);
		if (result === null) {
			return { code: original, success: false, failedBlock: block };
		}
		code = result;
	}
	return { code, success: true };
}
