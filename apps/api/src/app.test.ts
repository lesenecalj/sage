import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

describe('GET /health', () => {
  it('returns the application status', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('notes routes', () => {
  it('creates a note and lists it', async () => {
    const app = createApp();

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

  it('rejects invalid note input', async () => {
    const response = await request(createApp()).post('/notes').send({ title: '   ' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'title and content must be non-empty strings' });
  });

  it('rejects note input with unknown fields', async () => {
    const response = await request(createApp()).post('/notes').send({
      title: 'Architecture',
      content: 'Keep it simple.',
      category: 'backend',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'title and content must be non-empty strings' });
  });

  it('rejects a null JSON body', async () => {
    const response = await request(createApp())
      .post('/notes')
      .set('Content-Type', 'application/json')
      .send('null');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'title and content must be non-empty strings' });
  });

  it.each([[], JSON.stringify('not an object')])(
    'rejects non-object note input: %j',
    async (body) => {
    const response = await request(createApp())
      .post('/notes')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'title and content must be non-empty strings' });
    },
  );

  it('returns a JSON error for malformed JSON', async () => {
    const response = await request(createApp())
      .post('/notes')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid JSON body' });
  });
});