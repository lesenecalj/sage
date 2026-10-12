import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NoteGenerationJob } from '@sage/contracts';
import * as notesApi from '../api/notes';
import { useNotes } from './useNotes';

const note = {
  id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45',
  title: 'Generated React note',
  content: 'Prefer composition.',
  sourceUrl: 'https://react.dev/learn',
  createdAt: '2026-10-07T12:01:00.000Z',
};
const activeJob = {
  id: 'c5d0af9d-8b5b-4b78-b088-25b4d4cf2610',
  status: 'running',
  stage: 'summarizing',
  noteId: null,
  error: null,
  createdAt: '2026-10-07T12:00:00.000Z',
  finishedAt: null,
} as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useNotes generation tracking', () => {
  it('preserves notes and accepted jobs created while initial hydration is pending', async () => {
    let resolveNotes: (notes: typeof note[]) => void = () => {};
    let resolveJobs: (jobs: NoteGenerationJob[]) => void = () => {};
    const list = vi.spyOn(notesApi, 'listNotes')
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNotes = resolve; }))
      .mockResolvedValue([note]);
    vi.spyOn(notesApi, 'listNoteGenerations').mockImplementation(() => new Promise((resolve) => { resolveJobs = resolve; }));
    vi.spyOn(notesApi, 'createNote').mockResolvedValue(note);
    vi.spyOn(notesApi, 'createNoteGeneration').mockResolvedValue(activeJob);
    const subscribe = vi.spyOn(notesApi, 'subscribeToNoteGeneration').mockReturnValue({ close: vi.fn() } as unknown as EventSource);
    const { result } = renderHook(() => useNotes());
    await waitFor(() => expect(list).toHaveBeenCalledOnce());

    await act(async () => {
      await result.current.create({ title: note.title, content: note.content });
      await result.current.generateFromUrl({ url: note.sourceUrl, instruction: 'Summarize' });
      resolveNotes([]);
      resolveJobs([]);
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.notes).toEqual([note]);
    expect(result.current.generationJobs).toEqual([activeJob]);
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it('removes a permanently closed subscription so it can be opened again', async () => {
    vi.stubGlobal('EventSource', { CLOSED: 2 });
    let onError: (error: Error, retryable: boolean) => void = () => {};
    vi.spyOn(notesApi, 'listNotes').mockResolvedValue([]);
    vi.spyOn(notesApi, 'listNoteGenerations').mockResolvedValue([activeJob]);
    vi.spyOn(notesApi, 'createNoteGeneration').mockResolvedValue(activeJob);
    const subscribe = vi.spyOn(notesApi, 'subscribeToNoteGeneration').mockImplementation((_id, _onJob, callback) => {
      onError = callback;
      return { close: vi.fn(), readyState: 2 } as unknown as EventSource;
    });
    const { result } = renderHook(() => useNotes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => onError(new Error('Tracking stopped.'), false));
    await act(async () => {
      await result.current.generateFromUrl({ url: note.sourceUrl, instruction: 'Summarize' });
    });

    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('clears a temporary tracking warning when a valid job update arrives', async () => {
    let onJob: (job: NoteGenerationJob) => void = () => {};
    let onError: (error: Error, retryable: boolean) => void = () => {};
    vi.spyOn(notesApi, 'listNotes').mockResolvedValue([]);
    vi.spyOn(notesApi, 'listNoteGenerations').mockResolvedValue([activeJob]);
    vi.spyOn(notesApi, 'subscribeToNoteGeneration').mockImplementation((_id, handleJob, handleError) => {
      onJob = handleJob;
      onError = handleError;
      return { close: vi.fn() } as unknown as EventSource;
    });
    const { result } = renderHook(() => useNotes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => onError(new Error('Tracking temporarily unavailable.'), true));
    expect(result.current.errorMessage).toBe('Tracking temporarily unavailable.');
    act(() => onJob(activeJob));
    expect(result.current.errorMessage).toBeNull();
  });

  it('does not subscribe when submission resolves after unmount', async () => {
    let accept: (job: NoteGenerationJob) => void = () => {};
    vi.spyOn(notesApi, 'listNotes').mockResolvedValue([]);
    vi.spyOn(notesApi, 'listNoteGenerations').mockResolvedValue([]);
    vi.spyOn(notesApi, 'createNoteGeneration').mockImplementation(() => new Promise((resolve) => { accept = resolve; }));
    const subscribe = vi.spyOn(notesApi, 'subscribeToNoteGeneration');
    const { result, unmount } = renderHook(() => useNotes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let submission: Promise<boolean> = Promise.resolve(false);
    act(() => { submission = result.current.generateFromUrl({ url: note.sourceUrl, instruction: 'Summarize' }); });
    unmount();
    accept(activeJob);
    await expect(submission).resolves.toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('discards a refresh that predates a manual creation and reloads before applying it', async () => {
    const olderNote = { ...note, id: activeJob.id, createdAt: activeJob.createdAt };
    let resolveRefresh: (notes: typeof note[]) => void = () => {};
    let onJob: (job: NoteGenerationJob) => void = () => {};
    const list = vi.spyOn(notesApi, 'listNotes').mockResolvedValueOnce([olderNote])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }))
      .mockResolvedValueOnce([note, olderNote]);
    vi.spyOn(notesApi, 'listNoteGenerations').mockResolvedValue([activeJob]);
    vi.spyOn(notesApi, 'createNote').mockResolvedValue(note);
    vi.spyOn(notesApi, 'subscribeToNoteGeneration').mockImplementation((_id, callback) => {
      onJob = callback;
      return { close: vi.fn() } as unknown as EventSource;
    });
    const { result } = renderHook(() => useNotes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => onJob({ ...activeJob, status: 'completed', stage: 'completed', noteId: note.id, finishedAt: note.createdAt }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await act(async () => { await result.current.create({ title: note.title, content: note.content }); });
    await act(async () => { resolveRefresh([olderNote]); });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(result.current.notes).toEqual([note, olderNote]);
  });

  it('places a newly created manual note before the existing notes', async () => {
    const olderNote = { ...note, id: activeJob.id, createdAt: activeJob.createdAt };
    vi.spyOn(notesApi, 'listNotes').mockResolvedValue([olderNote]);
    vi.spyOn(notesApi, 'listNoteGenerations').mockResolvedValue([]);
    vi.spyOn(notesApi, 'createNote').mockResolvedValue(note);
    const { result } = renderHook(() => useNotes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.create({ title: note.title, content: note.content });
    });

    expect(result.current.notes).toEqual([note, olderNote]);
  });

  it('restores active jobs, applies pushed completion, refreshes notes and closes the stream', async () => {
    const olderNote = { ...note, id: activeJob.id, createdAt: activeJob.createdAt };
    const onJob = vi.fn<(job: NoteGenerationJob) => void>();
    const close = vi.fn();
    vi.spyOn(notesApi, 'listNotes')
      .mockResolvedValueOnce([olderNote])
      .mockResolvedValueOnce([note, olderNote]);
    vi.spyOn(notesApi, 'listNoteGenerations').mockResolvedValue([activeJob]);
    vi.spyOn(notesApi, 'subscribeToNoteGeneration').mockImplementation((_id, handleJob) => {
      onJob.mockImplementation(handleJob);
      return { close } as unknown as EventSource;
    });

    const { result, unmount } = renderHook(() => useNotes());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.generationJobs).toEqual([activeJob]);
    expect(notesApi.subscribeToNoteGeneration).toHaveBeenCalledWith(activeJob.id, expect.any(Function), expect.any(Function));

    const completedJob: NoteGenerationJob = {
      ...activeJob,
      status: 'completed',
      stage: 'completed',
      noteId: note.id,
      finishedAt: note.createdAt,
    };
    act(() => onJob(completedJob));

    await waitFor(() => expect(result.current.generationJobs[0]).toMatchObject({ status: 'completed' }));
    await waitFor(() => expect(result.current.notes).toEqual([note, olderNote]));
    expect(close).toHaveBeenCalledOnce();
    unmount();
  });

  it('closes active SSE connections when the app unmounts', async () => {
    const close = vi.fn();
    vi.spyOn(notesApi, 'listNotes').mockResolvedValue([]);
    vi.spyOn(notesApi, 'listNoteGenerations').mockResolvedValue([activeJob]);
    vi.spyOn(notesApi, 'subscribeToNoteGeneration').mockReturnValue({ close } as unknown as EventSource);

    const { result, unmount } = renderHook(() => useNotes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(notesApi.subscribeToNoteGeneration).toHaveBeenCalledWith(activeJob.id, expect.any(Function), expect.any(Function));
    unmount();

    expect(close).toHaveBeenCalledOnce();
  });

  it('treats job acceptance as successful submission and subscribes without waiting for completion', async () => {
    const close = vi.fn();
    vi.spyOn(notesApi, 'listNotes').mockResolvedValue([]);
    vi.spyOn(notesApi, 'listNoteGenerations').mockResolvedValue([]);
    vi.spyOn(notesApi, 'createNoteGeneration').mockResolvedValue(activeJob);
    vi.spyOn(notesApi, 'subscribeToNoteGeneration').mockReturnValue({ close } as unknown as EventSource);

    const { result } = renderHook(() => useNotes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.generateFromUrl({
        url: 'https://react.dev/learn',
        instruction: 'Summarize React practices',
      })).resolves.toBe(true);
    });

    expect(result.current.generationJobs).toEqual([activeJob]);
    expect(notesApi.subscribeToNoteGeneration).toHaveBeenCalledWith(activeJob.id, expect.any(Function), expect.any(Function));
    expect(result.current.isCreating).toBe(false);
  });
});