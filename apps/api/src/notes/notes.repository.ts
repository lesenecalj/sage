import { randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient } from '@prisma/client';

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};

export type CreateNoteInput = Pick<Note, 'title' | 'content'>;
export type UpdateNoteInput = CreateNoteInput;

export type NotesRepository = {
  create(input: CreateNoteInput): Promise<Note>;
  list(): Promise<Note[]>;
  update(id: string, input: UpdateNoteInput): Promise<Note | null>;
  delete(id: string): Promise<boolean>;
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
    async update(id, input) {
      const noteIndex = notes.findIndex((note) => note.id === id);

      if (noteIndex === -1) {
        return null;
      }

      const existingNote = notes[noteIndex];

      if (!existingNote) {
        return null;
      }

      const note = { ...existingNote, ...input };
      notes[noteIndex] = note;
      return note;
    },
    async delete(id) {
      const noteIndex = notes.findIndex((note) => note.id === id);

      if (noteIndex === -1) {
        return false;
      }

      notes.splice(noteIndex, 1);
      return true;
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
      const notes = await prisma.note.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return notes.map(toNote);
    },
    async update(id, input) {
      try {
        const note = await prisma.note.update({ where: { id }, data: input });
        return toNote(note);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          return null;
        }

        throw error;
      }
    },
    async delete(id) {
      const result = await prisma.note.deleteMany({ where: { id } });
      return result.count > 0;
    },
  };
}