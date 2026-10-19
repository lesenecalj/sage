import { randomUUID } from 'node:crypto';

import { Prisma, type Note as PrismaNote, type PrismaClient } from '@prisma/client';
import type { Note } from '@sage/contracts';

export type { Note } from '@sage/contracts';

export type CreateNoteInput = Pick<Note, 'title' | 'content'> & { sourceUrl?: string | null };
export type UpdateNoteInput = Pick<Note, 'title' | 'content'>;

export type NotesRepository = {
  create(input: CreateNoteInput): Promise<Note>;
  createGenerated(id: string, input: CreateNoteInput): Promise<Note>;
  getIndexingRevision(id: string): Promise<string | null>;
  list(): Promise<Note[]>;
  update(id: string, input: UpdateNoteInput): Promise<Note | null>;
  delete(id: string): Promise<boolean>;
};

function toNote(note: PrismaNote): Note {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    sourceUrl: note.sourceUrl,
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
    async createGenerated(id, input) {
      const note = await prisma.note.upsert({
        where: { id },
        update: {},
        create: { ...input, id },
      });
      return toNote(note);
    },
    async getIndexingRevision(id) {
      const note = await prisma.note.findUnique({
        where: { id },
        select: { indexingRevision: true },
      });
      return note?.indexingRevision ?? null;
    },
    async list() {
      const notes = await prisma.note.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return notes.map(toNote);
    },
    async update(id, input) {
      try {
        const note = await prisma.note.update({
          where: { id },
          data: {
            ...input,
            indexingRevision: randomUUID(),
            indexingStatus: 'pending',
            indexingError: null,
          },
        });
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