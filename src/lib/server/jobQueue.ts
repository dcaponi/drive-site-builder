import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'running' | 'done' | 'error';

export interface Job {
	status: JobStatus;
	progress: string;
	error?: string;
}

const jobs = new Map<string, Job>();

export function createJob(): string {
	const id = uuidv4();
	jobs.set(id, { status: 'pending', progress: 'Queued…' });
	return id;
}

export function updateJob(id: string, patch: Partial<Job>): void {
	const existing = jobs.get(id);
	if (existing) {
		jobs.set(id, { ...existing, ...patch });
	}
}

export function getJob(id: string): Job | undefined {
	return jobs.get(id);
}
