import { z } from 'zod';

import type { Note, NotesRepository } from './notes.repository.js';

const createNoteSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
}).strict();

type CreateNoteResult =
  | { success: true; note: Note }
  | { success: false; error: 'INVALID_INPUT' };

export type NotesService = {
  create(input: unknown): Promise<CreateNoteResult>;
  list(): Promise<Note[]>;
};

export function createNotesService(repository: NotesRepository): NotesService {
  return {
    async create(input) {
      const result = createNoteSchema.safeParse(input);

      if (!result.success) {
        return { success: false, error: 'INVALID_INPUT' };
      }

      return { success: true, note: await repository.create(result.data) };
    },
    async list() {
      return repository.list();
    },
  };
}