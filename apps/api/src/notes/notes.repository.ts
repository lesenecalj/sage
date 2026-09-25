import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};

export type CreateNoteInput = Pick<Note, 'title' | 'content'>;

export type NotesRepository = {
  create(input: CreateNoteInput): Promise<Note>;
  list(): Promise<Note[]>;
};

export function createInMemoryNotesRepository(): NotesRepository {
  const notes: Note[] = [];

  return {
    async create({ title, content }) {
      const note: Note = {
        id: randomUUID(),
        title,
        content,
        createdAt: new Date().toISOString(),
      };

      notes.push(note);
      return note;
    },
    async list() {
      return [...notes];
    },
  };
}

function toNote(note: {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
}): Note {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
  };
}

export function createPrismaNotesRepository(
  prisma: Pick<PrismaClient, 'note'>,
): NotesRepository {
  return {
    async create(input) {
      const note = await prisma.note.create({ data: input });
      return toNote(note);
    },
    async list() {
      const notes = await prisma.note.findMany({ orderBy: { createdAt: 'asc' } });
      return notes.map(toNote);
    },
  };
}