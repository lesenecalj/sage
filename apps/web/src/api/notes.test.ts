import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  createNote,
  createNoteGeneration,
  deleteNote,
  listNoteGenerations,
  listNotes,
  subscribeToNoteGenerationEvents,
  updateNote,
} from './notes';

const note = {
  id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45',
  title: 'Architecture',
  content: 'Keep it simple.',
  sourceUrl: null,
  createdAt: '2026-09-24T12:00:00.000Z',
};
const generationJob = {
  id: 'c5d0af9d-8b5b-4b78-b088-25b4d4cf2610',
  status: 'running',
  stage: 'summarizing',
  noteId: null,
  error: null,
  createdAt: '2026-10-07T12:00:00.000Z',
  finishedAt: null,
} as const;

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

  it('submits URL note generation and returns the accepted job', async () => {
    const input = { url: 'https://react.dev/learn', instruction: 'Summarize React practices' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ job: generationJob }, { status: 202 })));

    await expect(createNoteGeneration(input)).resolves.toEqual(generationJob);
    expect(fetch).toHaveBeenCalledWith('/api/note-generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('loads retained generation jobs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ jobs: [generationJob] })));

    await expect(listNoteGenerations()).resolves.toEqual([generationJob]);
    expect(fetch).toHaveBeenCalledWith('/api/note-generations', { signal: undefined });
  });

  it('receives and validates SSE job updates, then closes on terminal state', () => {
    class MockEventSource extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 2;
      readonly url: string;
      readyState = MockEventSource.OPEN;
      withCredentials = false;
      close = vi.fn(() => { this.readyState = MockEventSource.CLOSED; });

      constructor(url: string) {
        super();
        this.url = url;
      }
    }
    vi.stubGlobal('EventSource', MockEventSource);
    const onJob = vi.fn();
    const onError = vi.fn();
    const events = subscribeToNoteGenerationEvents(generationJob.id, onJob, onError) as unknown as MockEventSource;

    events.dispatchEvent(new MessageEvent('job', { data: JSON.stringify({ job: generationJob }) }));

    expect(events.url).toBe(`/api/note-generations/${generationJob.id}/events`);
    expect(onJob).toHaveBeenCalledWith(generationJob);
    expect(onError).not.toHaveBeenCalled();
    expect(events.close).not.toHaveBeenCalled();

    events.dispatchEvent(new MessageEvent('error', {
      data: JSON.stringify({ error: 'Tracking temporarily unavailable.', retryable: true }),
    }));
    expect(onError).toHaveBeenCalledWith(new ApiError('Tracking temporarily unavailable.', 500), true);
    expect(events.close).not.toHaveBeenCalled();
    events.dispatchEvent(new Event('error'));
    expect(events.close).not.toHaveBeenCalled();

    const completedJob = {
      ...generationJob,
      status: 'completed',
      stage: 'completed',
      noteId: note.id,
      finishedAt: '2026-10-07T12:01:00.000Z',
    };
    events.dispatchEvent(new MessageEvent('job', { data: JSON.stringify({ job: completedJob }) }));

    expect(onJob).toHaveBeenLastCalledWith(completedJob);
    expect(events.close).toHaveBeenCalledOnce();
  });

  it('closes a non-retryable tracking error', () => {
    class MockEventSource extends EventTarget {
      readyState = 1;
      close = vi.fn(() => { this.readyState = 2; });
    }
    vi.stubGlobal('EventSource', MockEventSource);
    const onError = vi.fn();
    const events = subscribeToNoteGenerationEvents(generationJob.id, vi.fn(), onError) as unknown as MockEventSource;

    events.dispatchEvent(new MessageEvent('error', {
      data: JSON.stringify({ error: 'Generation job not found.', retryable: false }),
    }));

    expect(events.close).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(new ApiError('Generation job not found.', 500), false);
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