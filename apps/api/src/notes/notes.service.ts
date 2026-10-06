import { z } from 'zod';

import { fromUrlInputSchema, type FromUrlInput } from './from-url.input.js';
import type { Note, NotesRepository, UpdateNoteInput } from './notes.repository.js';
import { readWebPage, type WebPage } from './web-page.js';

export type NoteSummarizer = (page: WebPage, instruction: string) => Promise<string>;

export type NotesServiceOptions = {
  readPage?: (url: string) => Promise<WebPage>;
  summarize: NoteSummarizer;
};

const createNoteSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
}).strict();
const noteIdSchema = z.string().uuid();

type CreateNoteResult =
  | { success: true; note: Note }
  | { success: false; error: 'INVALID_INPUT' };

type UpdateNoteResult =
  | { success: true; note: Note }
  | { success: false; error: 'INVALID_INPUT' | 'NOT_FOUND' };

type DeleteNoteResult =
  | { success: true }
  | { success: false; error: 'INVALID_INPUT' | 'NOT_FOUND' };

type GenerateFromUrlResult =
  | { success: true; note: Note }
  | { success: false; error: 'INVALID_INPUT' };

export type NotesService = {
  create(input: unknown): Promise<CreateNoteResult>;
  generateFromUrl(input: unknown): Promise<GenerateFromUrlResult>;
  list(): Promise<Note[]>;
  update(id: unknown, input: unknown): Promise<UpdateNoteResult>;
  delete(id: unknown): Promise<DeleteNoteResult>;
};

export function createNotesService(
  repository: NotesRepository,
  { readPage = readWebPage, summarize }: NotesServiceOptions,
): NotesService {
  return {
    async create(input) {
      const result = createNoteSchema.safeParse(input);

      if (!result.success) {
        return { success: false, error: 'INVALID_INPUT' };
      }

      return { success: true, note: await repository.create(result.data) };
    },
    async generateFromUrl(input) {
      const result = fromUrlInputSchema.safeParse(input);

      if (!result.success) {
        return { success: false, error: 'INVALID_INPUT' };
      }
      const page = await readPage(result.data.url);
      const content = (await summarize(page, result.data.instruction)).trim();
      if (!content) throw new Error('The model returned an empty summary.');

      const note = await repository.create({ title: page.title, content, sourceUrl: page.url });
      return { success: true, note };
    },
    async list() {
      return repository.list();
    },
    async update(id, input) {
      const idResult = noteIdSchema.safeParse(id);
      const inputResult = createNoteSchema.safeParse(input);

      if (!idResult.success || !inputResult.success) {
        return { success: false, error: 'INVALID_INPUT' };
      }

      const note = await repository.update(idResult.data, inputResult.data satisfies UpdateNoteInput);

      if (!note) {
        return { success: false, error: 'NOT_FOUND' };
      }

      return { success: true, note };
    },
    async delete(id) {
      const idResult = noteIdSchema.safeParse(id);

      if (!idResult.success) {
        return { success: false, error: 'INVALID_INPUT' };
      }

      const deleted = await repository.delete(idResult.data);
      return deleted ? { success: true } : { success: false, error: 'NOT_FOUND' };
    },
  };
}