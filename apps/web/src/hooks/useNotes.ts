import { useEffect, useRef, useState } from 'react';

import {
  ApiError,
  createNoteGeneration,
  createNote,
  deleteNote,
  listNotes,
  listNoteGenerations,
  subscribeToNoteGeneration,
  type CreateNoteInput,
  type GenerateNoteInput,
  type Note,
  type NoteGenerationJob,
  updateNote,
} from '../api/notes';

type NoteMutationResult<T> = { success: true; value: T } | { success: false };

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred.';
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [generationJobs, setGenerationJobs] = useState<NoteGenerationJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmittingGeneration, setIsSubmittingGeneration] = useState(false);
  const [pendingNoteIds, setPendingNoteIds] = useState<ReadonlySet<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [trackingMessage, setTrackingMessage] = useState<string | null>(null);
  const eventSources = useRef(new Map<string, EventSource>());
  const lifecycle = useRef<AbortController | null>(null);
  const notesRevision = useRef(0);
  const pendingRefresh = useRef<Promise<void>>(Promise.resolve());

  function refreshNotes(signal: AbortSignal): Promise<void> {
    const refresh = pendingRefresh.current.then(async () => {
      while (!signal.aborted) {
        const revision = notesRevision.current;
        const loadedNotes = await listNotes(signal);
        if (signal.aborted) return;
        if (revision !== notesRevision.current) continue;
        setNotes(loadedNotes);
        return;
      }
    });
    pendingRefresh.current = refresh.catch(() => {});
    return refresh;
  }

  function handleNoteGenerationUpdate(job: NoteGenerationJob) {
    setTrackingMessage(null);
    setGenerationJobs((currentJobs) => {
      const jobsById = new Map(currentJobs.map((currentJob) => [currentJob.id, currentJob]));
      jobsById.set(job.id, job);
      return [...jobsById.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    });

    if (job.status === 'completed' || job.status === 'failed') {
      eventSources.current.get(job.id)?.close();
      eventSources.current.delete(job.id);
      if (job.status === 'completed') {
        const signal = lifecycle.current?.signal;
        if (signal && !signal.aborted) {
          void refreshNotes(signal).catch((error: unknown) => {
            if (!signal.aborted) setErrorMessage(getErrorMessage(error));
          });
        }
      }
    }
  }

  function subscribeToJob(jobId: string) {
    const signal = lifecycle.current?.signal;
    if (!signal || signal.aborted || eventSources.current.has(jobId)) return;
    const events = subscribeToNoteGeneration(
      jobId,
      (job) => {
        if (!signal.aborted) handleNoteGenerationUpdate(job);
      },
      (error, retryable) => {
        if (signal.aborted) return;
        if (retryable) {
          setTrackingMessage(getErrorMessage(error));
        } else {
          eventSources.current.delete(jobId);
          setErrorMessage(getErrorMessage(error));
        }
      },
    );
    eventSources.current.set(jobId, events);
  }

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;

    async function loadInitialState() {
      try {
        const [, loadedJobs] = await Promise.all([
          refreshNotes(controller.signal),
          listNoteGenerations(controller.signal),
        ]);
        if (controller.signal.aborted) return;

        setGenerationJobs((currentJobs) => {
          const jobsById = new Map(loadedJobs.map((job) => [job.id, job]));
          currentJobs.forEach((job) => jobsById.set(job.id, job));
          return [...jobsById.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        });
        for (const job of loadedJobs) {
          if (job.status === 'queued' || job.status === 'running') subscribeToJob(job.id);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialState();

    return () => {
      controller.abort();
      for (const events of eventSources.current.values()) events.close();
      eventSources.current.clear();
    };
  }, []);

  async function create(input: CreateNoteInput): Promise<boolean> {
    const signal = lifecycle.current?.signal;
    setIsCreating(true);
    setErrorMessage(null);
    setTrackingMessage(null);

    try {
      const note = await createNote(input);
      if (!signal || signal.aborted) return false;
      notesRevision.current += 1;
      setNotes((currentNotes) => [note, ...currentNotes]);
      return true;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return false;
    } finally {
      setIsCreating(false);
    }
  }

  async function generateFromUrl(input: GenerateNoteInput): Promise<boolean> {
    const signal = lifecycle.current?.signal;
    setIsSubmittingGeneration(true);
    setErrorMessage(null);
    setTrackingMessage(null);

    try {
      const job = await createNoteGeneration(input);
      if (!signal || signal.aborted) return false;
      handleNoteGenerationUpdate(job);
      if (job.status === 'queued' || job.status === 'running') subscribeToJob(job.id);
      return true;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return false;
    } finally {
      setIsSubmittingGeneration(false);
    }
  }

  async function runNoteMutation<T>(
    id: string,
    operation: () => Promise<T>,
  ): Promise<NoteMutationResult<T>> {
    setPendingNoteIds((currentIds) => new Set(currentIds).add(id));
    setErrorMessage(null);

    try {
      return { success: true, value: await operation() };
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return { success: false };
    } finally {
      setPendingNoteIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(id);
        return nextIds;
      });
    }
  }

  async function update(id: string, input: CreateNoteInput): Promise<boolean> {
    const result = await runNoteMutation(id, () => updateNote(id, input));

    if (!result.success) {
      return false;
    }

    notesRevision.current += 1;
    setNotes((currentNotes) =>
      currentNotes.map((note) => (note.id === id ? result.value : note)),
    );
    return true;
  }

  async function remove(id: string): Promise<boolean> {
    const result = await runNoteMutation(id, () => deleteNote(id));

    if (!result.success) {
      return false;
    }

    notesRevision.current += 1;
    setNotes((currentNotes) => currentNotes.filter((note) => note.id !== id));
    return true;
  }

  return {
    notes,
    isLoading,
    isCreating,
    isSubmittingGeneration,
    generationJobs,
    pendingNoteIds,
    errorMessage: errorMessage ?? trackingMessage,
    create,
    generateFromUrl,
    update,
    remove,
  };
}