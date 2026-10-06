import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { createInMemoryNotesRepository } from './notes/notes.repository.js';
import { createNotesService } from './notes/notes.service.js';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp({
    notesService: createNotesService(createInMemoryNotesRepository(), { summarize: async () => '' }),
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
    const notesRepository = createInMemoryNotesRepository();
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
      title: 'Example page',
      content: 'Generated summary',
      sourceUrl: 'https://example.com/article',
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
    const createResponse = await request(app).post('/notes').send({
      title: 'Original title',
      content: 'Original content',
    });
    const noteId = createResponse.body.note.id as string;

    const updateResponse = await request(app).patch(`/notes/${noteId}`).send({
      title: 'Updated title',
      content: 'Updated content',
    });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.note).toMatchObject({
      id: noteId,
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
    const createResponse = await request(app).post('/notes').send({
      title: 'To delete',
      content: 'Temporary content',
    });
    const noteId = createResponse.body.note.id as string;

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