import { z } from 'zod';

export const noteSchema = z.object({
	id: z.string().uuid(),
	title: z.string(),
	content: z.string(),
	sourceUrl: z.url().nullable(),
	createdAt: z.string().datetime(),
}).strict();

export type Note = z.infer<typeof noteSchema>;