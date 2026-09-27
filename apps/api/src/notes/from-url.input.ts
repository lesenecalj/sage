import { z } from 'zod';

export const fromUrlInputSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2048),
  instruction: z.string().trim().min(1).max(2000),
}).strict();

export type FromUrlInput = z.output<typeof fromUrlInputSchema>;