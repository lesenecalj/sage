import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '@sage/contracts';
import type { CreateNoteInput, NotesRepository, UpdateNoteInput } from './notes.repository.js';
import { RETRIEVAL_PIPELINE_VERSION } from './retrieval/note-splitter.js';
import type { NoteIndexingJobs } from './retrieval/note-indexing-jobs.port.js';
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
    getIndexingRevision: vi.fn(async () => 'revision-1'),
    list: vi.fn(async () => []),
    update: vi.fn(async (_id: string, _noteInput: UpdateNoteInput) => null),
    delete: vi.fn(async (_id: string) => false),
  };
}

function createIndexingJobsStub(): Pick<NoteIndexingJobs, 'enqueue'> {
  return { enqueue: vi.fn(async () => {}) };
}

describe('NotesService', () => {
  let service: NotesService;
  let indexingJobs: Pick<NoteIndexingJobs, 'enqueue'>;

  beforeEach(() => {
    indexingJobs = createIndexingJobsStub();
    service = createNotesService(createRepositoryStub(), { summarize: async () => '', indexingJobs });
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
    service = createNotesService(repository, { summarize: async () => '', indexingJobs });

    await expect(service.create({ title: '', content: 'Content' })).resolves.toEqual({
      success: false,
      error: 'INVALID_INPUT',
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects invalid job input before reading or summarizing the page', async () => {
    const readPage = vi.fn();
    const summarize = vi.fn();
    const service = createNotesService(createRepositoryStub(), { readPage, summarize, indexingJobs });

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
      indexingJobs,
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
    expect(indexingJobs.enqueue).toHaveBeenCalledWith({
      noteId: jobId,
      sourceRevision: 'revision-1',
      pipelineVersion: RETRIEVAL_PIPELINE_VERSION,
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
    service = createNotesService(repository, { readPage, summarize, indexingJobs });

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
      indexingJobs,
    });

    await expect(service.processGenerationJob({
      id: noteId,
      input: { url: 'https://react.dev/', instruction: 'Summarize React practices' },
      reportProgress: async () => {},
    })).rejects.toThrow('empty summary');
    expect(repository.createGenerated).not.toHaveBeenCalled();
  });

  it('enqueues indexing after creating a note', async () => {
    const repository = createRepositoryStub();
    service = createNotesService(repository, { summarize: async () => '', indexingJobs });

    const result = await service.create({ title: 'Title', content: 'Content' });

    expect(result.success).toBe(true);
    expect(indexingJobs.enqueue).toHaveBeenCalledWith({
      noteId,
      sourceRevision: 'revision-1',
      pipelineVersion: RETRIEVAL_PIPELINE_VERSION,
    });
  });

  it('enqueues indexing after updating a note', async () => {
    const repository = createRepositoryStub();
    vi.mocked(repository.update).mockResolvedValue(createNote(noteId, {
      title: 'Updated',
      content: 'Updated content',
    }));
    service = createNotesService(repository, { summarize: async () => '', indexingJobs });

    const result = await service.update(noteId, { title: 'Updated', content: 'Updated content' });

    expect(result.success).toBe(true);
    expect(indexingJobs.enqueue).toHaveBeenCalledWith({
      noteId,
      sourceRevision: 'revision-1',
      pipelineVersion: RETRIEVAL_PIPELINE_VERSION,
    });
  });

  it('does not fail a persisted note when indexing enqueue fails', async () => {
    const repository = createRepositoryStub();
    const enqueue = vi.fn().mockRejectedValue(new Error('Redis unavailable'));
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    service = createNotesService(repository, { summarize: async () => '', indexingJobs: { enqueue } });

    try {
      const result = await service.create({ title: 'Title', content: 'Content' });

      expect(result.success).toBe(true);
      expect(repository.create).toHaveBeenCalledOnce();
      expect(logError).toHaveBeenCalledOnce();
    } finally {
      logError.mockRestore();
    }
  });

});