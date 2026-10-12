import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '@sage/contracts';
import type { CreateNoteInput, NotesRepository, UpdateNoteInput } from './notes.repository.js';
import {
  createNotesService,
  type NoteGenerationStage,
  type NotesService,
} from './notes.service.js';

const page = {
  title: 'React guide',
  text: 'Prefer composition.',
  url: 'https://react.dev/learn',
};
const noteId = '7d5b9456-eb94-414f-a129-da4aa1bb2c45';

function createNote(id: string, noteInput: CreateNoteInput): Note {
  return {
    id,
    title: noteInput.title,
    content: noteInput.content,
    sourceUrl: noteInput.sourceUrl ?? null,
    createdAt: '2026-09-27T12:00:00.000Z',
  };
}

function createRepositoryStub(): NotesRepository {
  return {
    create: vi.fn(async (noteInput) => createNote(noteId, noteInput)),
    createGenerated: vi.fn(async (id, noteInput) => createNote(id, noteInput)),
    list: vi.fn(async () => []),
    update: vi.fn(async (_id: string, _noteInput: UpdateNoteInput) => null),
    delete: vi.fn(async (_id: string) => false),
  };
}

describe('NotesService', () => {
  let service: NotesService;

  beforeEach(() => {
    service = createNotesService(createRepositoryStub(), { summarize: async () => '' });
  });

  it('normalizes valid input before creating a note', async () => {
    const result = await service.create({ title: '  Architecture  ', content: '  Keep it simple.  ' });

    expect(result).toMatchObject({
      success: true,
      note: {
        title: 'Architecture',
        content: 'Keep it simple.',
      },
    });
  });

  it('rejects invalid input without creating a note', async () => {
    const repository = createRepositoryStub();
    service = createNotesService(repository, { summarize: async () => '' });

    await expect(service.create({ title: '', content: 'Content' })).resolves.toEqual({
      success: false,
      error: 'INVALID_INPUT',
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects invalid job input before reading or summarizing the page', async () => {
    const readPage = vi.fn();
    const summarize = vi.fn();
    const service = createNotesService(createRepositoryStub(), { readPage, summarize });

    await expect(service.processGenerationJob({
      id: noteId,
      input: { url: 'file:///etc/passwd', instruction: 'Summarize' },
      reportProgress: async () => {},
    })).rejects.toThrow('Invalid note generation job input.');
    expect(readPage).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
  });

  it('reports job stages while the service persists the generated note', async () => {
    const repository = createRepositoryStub();
    const stages: NoteGenerationStage[] = [];
    const reportStage = async (stage: NoteGenerationStage) => { stages.push(stage); };
    const service = createNotesService(repository, {
      readPage: async () => page,
      summarize: async () => 'Generated content',
    });
    const jobId = '7d5b9456-eb94-414f-a129-da4aa1bb2c45';

    const note = await service.processGenerationJob({
      id: jobId,
      input: { url: 'https://react.dev/', instruction: 'Summarize React practices' },
      reportProgress: reportStage,
    });

    expect(note.id).toBe(jobId);
    expect(stages).toEqual(['reading_page', 'summarizing', 'saving_note']);
    expect(repository.createGenerated).toHaveBeenCalledWith(jobId, {
      title: page.title,
      content: 'Generated content',
      sourceUrl: page.url,
    });
  });

  it.each(['reading', 'summarizing'] as const)('does not save a note when %s fails', async (stage) => {
    const repository = createRepositoryStub();
    const readPage = stage === 'reading'
      ? vi.fn().mockRejectedValue(new Error('Page unavailable'))
      : vi.fn().mockResolvedValue(page);
    const summarize = stage === 'summarizing'
      ? vi.fn().mockRejectedValue(new Error('Model unavailable'))
      : vi.fn().mockResolvedValue('Summary');
    service = createNotesService(repository, { readPage, summarize });

    await expect(service.processGenerationJob({
      id: noteId,
      input: { url: 'https://react.dev/', instruction: 'Summarize React practices' },
      reportProgress: async () => {},
    })).rejects.toThrow();
    expect(repository.createGenerated).not.toHaveBeenCalled();
    if (stage === 'reading') expect(summarize).not.toHaveBeenCalled();
  });

  it('does not save an empty summary', async () => {
    const repository = createRepositoryStub();
    service = createNotesService(repository, {
      readPage: async () => page,
      summarize: async () => '  ',
    });

    await expect(service.processGenerationJob({
      id: noteId,
      input: { url: 'https://react.dev/', instruction: 'Summarize React practices' },
      reportProgress: async () => {},
    })).rejects.toThrow('empty summary');
    expect(repository.createGenerated).not.toHaveBeenCalled();
  });

});