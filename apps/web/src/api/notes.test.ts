import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createNote, deleteNote, listNotes, updateNote } from './notes';

const note = {
  id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45',
  title: 'Architecture',
  content: 'Keep it simple.',
  sourceUrl: null,
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

  it('accepts notes with a source URL or an explicitly empty source', async () => {
    const sourced = { ...note, sourceUrl: 'https://react.dev/learn' };
    const manual = { ...note, sourceUrl: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ notes: [sourced, manual] })));

    await expect(listNotes()).resolves.toEqual([sourced, manual]);
  });

  it('rejects a response without the required source URL field', async () => {
    const { sourceUrl: _sourceUrl, ...incompleteNote } = note;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ notes: [incompleteNote] })));

    await expect(listNotes()).rejects.toEqual(
      new ApiError('The API returned an invalid response.', 200),
    );
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

  it('updates an existing note', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ note })));

    await expect(updateNote(note.id, { title: note.title, content: note.content })).resolves.toEqual(note);
    expect(fetch).toHaveBeenCalledWith(`/api/notes/${note.id}`, expect.objectContaining({ method: 'PATCH' }));
  });

  it('deletes an existing note', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(deleteNote(note.id)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(`/api/notes/${note.id}`, { method: 'DELETE' });
  });
});