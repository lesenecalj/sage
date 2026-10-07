import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';

import { type Note, type NoteGenerationJob } from '@sage/contracts';
import { createApp } from './app.js';
import { fromUrlInputSchema } from './notes/from-url.input.js';
import type { CreateNoteInput, NotesRepository, UpdateNoteInput } from './notes/notes.repository.js';
import { createNotesService } from './notes/notes.service.js';
import type { NoteGenerationJobs } from './notes/note-generation-jobs.port.js';

const noteId = '7d5b9456-eb94-414f-a129-da4aa1bb2c45';

function createNote(id: string, input: CreateNoteInput): Note {
  return {
    id,
    title: input.title,
    content: input.content,
    sourceUrl: input.sourceUrl ?? null,
    createdAt: '2026-09-27T12:00:00.000Z',
  };
}

function createRepositoryStub(): NotesRepository {
  return {
    create: vi.fn(async (input) => createNote(noteId, input)),
    createGenerated: vi.fn(async (id, input) => createNote(id, input)),
    list: vi.fn(async () => []),
    update: vi.fn(async (_id: string, _input: UpdateNoteInput) => null),
    delete: vi.fn(async (_id: string) => false),
  };
}

function createGenerationJobsStub(initialJob: NoteGenerationJob) {
  let job = initialJob;
  const listeners = new Set<() => void>();
  const service: NoteGenerationJobs = {
    waitUntilReady: async () => {},
    close: async () => {},
    async submit(input) {
      return fromUrlInputSchema.safeParse(input).success
        ? { success: true, job }
        : { success: false, error: 'INVALID_INPUT' };
    },
    async get(id) {
      return id === job.id ? job : null;
    },
    async list() {
      return [job];
    },
    subscribe(id, listener) {
      if (id !== job.id) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    service,
    update(nextJob: NoteGenerationJob) {
      job = nextJob;
      listeners.forEach((listener) => listener());
    },
  };
}

const initialJob: NoteGenerationJob = {
  id: noteId,
  status: 'queued',
  stage: 'queued',
  noteId: null,
  error: null,
  createdAt: '2026-09-27T12:00:00.000Z',
  finishedAt: null,
};

let app: ReturnType<typeof createApp>;
let jobsHarness: ReturnType<typeof createGenerationJobsStub>;

beforeEach(() => {
  jobsHarness = createGenerationJobsStub(initialJob);
  app = createApp({
    notesService: createNotesService(createRepositoryStub(), { summarize: async () => '' }),
    noteGenerationJobs: jobsHarness.service,
  });
});

describe('GET /health', () => {
  it('returns the application status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('notes routes', () => {
  it('accepts URL generation as a durable job', async () => {
    const response = await request(app).post('/note-generations').send({
      url: 'https://example.com/article',
      instruction: 'Summarize the key ideas.',
    });

    expect(response.status).toBe(202);
    expect(response.headers.location).toBe(`/note-generations/${noteId}/events`);
    expect(response.body).toEqual({
      job: initialJob,
    });
  });

  it.each([
    { url: 'file:///etc/passwd', instruction: 'Summarize this.' },
    { url: 'https://example.com', instruction: '   ' },
    { url: 'https://example.com', instruction: 'Summarize this.', extra: true },
  ])('rejects invalid URL note input: %j', async (input) => {
    const response = await request(app).post('/note-generations').send(input);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid URL note input' });
  });

  it('lists and retrieves persisted job snapshots', async () => {
    await expect(request(app).get('/note-generations')).resolves.toMatchObject({
      status: 200,
      body: { jobs: [initialJob] },
    });
    await expect(request(app).get(`/note-generations/${noteId}`)).resolves.toMatchObject({
      status: 200,
      body: { job: initialJob },
    });
  });

  it('sends an initial SSE snapshot and pushed terminal state', async () => {
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/note-generations/${noteId}/events`);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('SSE response has no readable body.');

      const decoder = new TextDecoder();
      const initial = await reader.read();
      expect(decoder.decode(initial.value)).toContain(JSON.stringify({ job: initialJob }));

      const completedJob: NoteGenerationJob = {
        ...initialJob,
        status: 'completed',
        stage: 'completed',
        noteId,
        finishedAt: '2026-09-27T12:01:00.000Z',
      };
      jobsHarness.update(completedJob);

      const terminal = await reader.read();
      expect(decoder.decode(terminal.value)).toContain(JSON.stringify({ job: completedJob }));
      expect(terminal.done).toBe(false);
      expect((await reader.read()).done).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('creates a note and lists it', async () => {
    const repository = createRepositoryStub();
    const note = {
      id: noteId,
      title: 'Express conventions',
      content: 'Keep routes focused and validate input at the boundary.',
      sourceUrl: null,
      createdAt: '2026-09-27T12:00:00.000Z',
    };
    vi.mocked(repository.create).mockResolvedValue(note);
    vi.mocked(repository.list).mockResolvedValue([note]);
    app = createApp({
      notesService: createNotesService(repository, { summarize: async () => '' }),
      noteGenerationJobs: jobsHarness.service,
    });

    const createResponse = await request(app).post('/notes').send({
      title: 'Express conventions',
      content: 'Keep routes focused and validate input at the boundary.',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.note).toMatchObject({
      id: expect.any(String),
      title: 'Express conventions',
      content: 'Keep routes focused and validate input at the boundary.',
      createdAt: expect.any(String),
    });

    const listResponse = await request(app).get('/notes');

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.notes).toEqual([createResponse.body.note]);
  });

  it('updates an existing note', async () => {
    const repository = createRepositoryStub();
    const note = {
      id: noteId,
      title: 'Updated title',
      content: 'Updated content',
      sourceUrl: null,
      createdAt: '2026-09-27T12:00:00.000Z',
    };
    vi.mocked(repository.update).mockResolvedValue(note);
    app = createApp({
      notesService: createNotesService(repository, { summarize: async () => '' }),
      noteGenerationJobs: jobsHarness.service,
    });

    const updatedNoteId = note.id;

    const updateResponse = await request(app).patch(`/notes/${updatedNoteId}`).send({
      title: 'Updated title',
      content: 'Updated content',
    });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.note).toMatchObject({
      id: updatedNoteId,
      title: 'Updated title',
      content: 'Updated content',
    });
  });

  it('rejects updates for missing notes', async () => {
    const response = await request(app).patch('/notes/7d5b9456-eb94-414f-a129-da4aa1bb2c45').send({
      title: 'Updated title',
      content: 'Updated content',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'note not found' });
  });

  it('deletes an existing note', async () => {
    const repository = createRepositoryStub();
    const note = {
      id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45',
      title: 'To delete',
      content: 'Temporary content',
      sourceUrl: null,
      createdAt: '2026-09-27T12:00:00.000Z',
    };
    vi.mocked(repository.create).mockResolvedValue(note);
    vi.mocked(repository.delete).mockResolvedValue(true);
    app = createApp({
      notesService: createNotesService(repository, { summarize: async () => '' }),
      noteGenerationJobs: jobsHarness.service,
    });
    const noteId = note.id;

    await request(app).post('/notes').send({ title: note.title, content: note.content });

    const deleteResponse = await request(app).delete(`/notes/${noteId}`);

    expect(deleteResponse.status).toBe(204);
    await expect(request(app).get('/notes')).resolves.toMatchObject({
      status: 200,
      body: { notes: [] },
    });
  });

  it('returns not found when deleting a missing note', async () => {
    const response = await request(app).delete('/notes/7d5b9456-eb94-414f-a129-da4aa1bb2c45');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'note not found' });
  });

  it('rejects invalid note input', async () => {
    const response = await request(app).post('/notes').send({ title: '   ' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'title and content must be non-empty strings' });
  });

  it('rejects note input with unknown fields', async () => {
    const response = await request(app).post('/notes').send({
      title: 'Architecture',
      content: 'Keep it simple.',
      category: 'backend',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'title and content must be non-empty strings' });
  });

  it('rejects a null JSON body', async () => {
    const response = await request(app)
      .post('/notes')
      .set('Content-Type', 'application/json')
      .send('null');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'title and content must be non-empty strings' });
  });

  it.each([[], JSON.stringify('not an object')])(
    'rejects non-object note input: %j',
    async (body) => {
    const response = await request(app)
      .post('/notes')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'title and content must be non-empty strings' });
    },
  );

  it('returns a JSON error for malformed JSON', async () => {
    const response = await request(app)
      .post('/notes')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid JSON body' });
  });
});