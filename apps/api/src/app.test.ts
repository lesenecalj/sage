import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '@sage/contracts';
import { createApp } from './app.js';
import type { CreateNoteInput, NotesRepository, UpdateNoteInput } from './notes/notes.repository.js';
import { createNotesService } from './notes/notes.service.js';

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

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp({
    notesService: createNotesService(createRepositoryStub(), { summarize: async () => '' }),
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
  it('generates and saves a note from a URL', async () => {
    const notesRepository = createRepositoryStub();
    const note = {
      id: noteId,
      title: 'Example page',
      content: 'Generated summary',
      sourceUrl: 'https://example.com/article',
      createdAt: '2026-09-27T12:00:00.000Z',
    };
    vi.mocked(notesRepository.createGenerated).mockResolvedValue(note);
    vi.mocked(notesRepository.list).mockResolvedValue([note]);
    const notesService = createNotesService(notesRepository, {
      readPage: async (url) => ({ title: 'Example page', text: 'Page text', url }),
      summarize: async () => 'Generated summary',
    });
    const app = createApp({ notesService });

    const response = await request(app).post('/notes/from-url').send({
      url: 'https://example.com/article',
      instruction: 'Summarize the key ideas.',
    });

    expect(response.status).toBe(201);
    expect(response.body.note).toMatchObject({
      ...note,
    });
    await expect(request(app).get('/notes')).resolves.toMatchObject({
      status: 200,
      body: { notes: [response.body.note] },
    });
  });

  it.each([
    { url: 'file:///etc/passwd', instruction: 'Summarize this.' },
    { url: 'https://example.com', instruction: '   ' },
    { url: 'https://example.com', instruction: 'Summarize this.', extra: true },
  ])('rejects invalid URL note input: %j', async (input) => {
    const response = await request(app).post('/notes/from-url').send(input);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid URL note input' });
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
    app = createApp({ notesService: createNotesService(repository, { summarize: async () => '' }) });

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
    app = createApp({ notesService: createNotesService(repository, { summarize: async () => '' }) });

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
    app = createApp({ notesService: createNotesService(repository, { summarize: async () => '' }) });
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