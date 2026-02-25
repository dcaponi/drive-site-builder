import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getJob } from '$lib/server/jobQueue.js';

export const GET: RequestHandler = async ({ params }) => {
	const job = getJob(params.jobId!);
	if (!job) return json({ error: 'Job not found' }, { status: 404 });
	return json(job);
};
