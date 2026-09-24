import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createNote, listNotes } from './notes';

const note = {
  id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45',
  title: 'Architecture',
  content: 'Keep it simple.',
  createdAt: '2026-09-24T12:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Notes API client', () => {
  it('returns notes from a valid list response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ notes: [note] })));

    await expect(listNotes()).resolves.toEqual([note]);
  });

  it('rejects an invalid success response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ notes: [{ ...note, id: 1 }] })));

    await expect(listNotes()).rejects.toEqual(
      new ApiError('The API returned an invalid response.', 200),
    );
  });

  it('exposes the API error response when creation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Invalid note input' }, { status: 400 })),
    );

    await expect(createNote({ title: 'Architecture', content: 'Keep it simple.' })).rejects.toEqual(
      new ApiError('Invalid note input', 400),
    );
  });
});