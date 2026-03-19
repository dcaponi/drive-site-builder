import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'running' | 'done' | 'error';

export interface Job {
	status: JobStatus;
	progress: string;
	error?: string;
	updatedAt: number;
}

// Jobs that haven't been updated in 5 minutes are considered timed out
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

const jobs = new Map<string, Job>();

export function createJob(): string {
	const id = uuidv4();
	jobs.set(id, { status: 'pending', progress: 'Queued…', updatedAt: Date.now() });
	return id;
}

export function updateJob(id: string, patch: Partial<Job>): void {
	const existing = jobs.get(id);
	if (existing) {
		jobs.set(id, { ...existing, ...patch, updatedAt: Date.now() });
	}
}

export function getJob(id: string): Job | undefined {
	const job = jobs.get(id);
	if (!job) return undefined;

	// Auto-expire stale running/pending jobs
	if (
		(job.status === 'running' || job.status === 'pending') &&
		Date.now() - job.updatedAt > JOB_TIMEOUT_MS
	) {
		const expired: Job = {
			status: 'error',
			progress: 'Timed out',
			error: 'Job timed out — no progress for 5 minutes. Try again.',
			updatedAt: Date.now()
		};
		jobs.set(id, expired);
		return expired;
	}

	return job;
}
