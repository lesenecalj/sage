import { randomUUID } from 'node:crypto';

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};

export type CreateNoteInput = Pick<Note, 'title' | 'content'>;

export type NotesRepository = {
  create(input: CreateNoteInput): Note;
  list(): Note[];
};

export function createInMemoryNotesRepository(): NotesRepository {
  const notes: Note[] = [];

  return {
    create({ title, content }) {
      const note: Note = {
        id: randomUUID(),
        title,
        content,
        createdAt: new Date().toISOString(),
      };

      notes.push(note);
      return note;
    },
    list() {
      return [...notes];
    },
  };
}