import { z } from 'zod';

export const noteSchema = z.object({
	id: z.string().uuid(),
	title: z.string(),
	content: z.string(),
	sourceUrl: z.url().nullable(),
	createdAt: z.string().datetime(),
}).strict();

export type Note = z.infer<typeof noteSchema>;

export const noteGenerationJobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export const noteGenerationJobStageSchema = z.enum([
	'queued',
	'reading_page',
	'summarizing',
	'saving_note',
	'completed',
	'failed',
]);

export const noteGenerationJobSchema = z.object({
	id: z.string().uuid(),
	status: noteGenerationJobStatusSchema,
	stage: noteGenerationJobStageSchema,
	noteId: z.string().uuid().nullable(),
	error: z.string().nullable(),
	createdAt: z.string().datetime(),
	finishedAt: z.string().datetime().nullable(),
}).strict();

export const noteGenerationJobResponseSchema = z.object({ job: noteGenerationJobSchema }).strict();
export const noteGenerationJobsResponseSchema = z.object({ jobs: z.array(noteGenerationJobSchema) }).strict();

export type NoteGenerationJobStatus = z.infer<typeof noteGenerationJobStatusSchema>;
export type NoteGenerationJobStage = z.infer<typeof noteGenerationJobStageSchema>;
export type NoteGenerationJob = z.infer<typeof noteGenerationJobSchema>;