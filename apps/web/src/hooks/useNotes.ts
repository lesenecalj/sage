import { useEffect, useState } from 'react';

import {
  ApiError,
  createNote,
  deleteNote,
  listNotes,
  type CreateNoteInput,
  type Note,
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
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingNoteIds, setPendingNoteIds] = useState<ReadonlySet<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadNotes() {
      try {
        setNotes(await listNotes(controller.signal));
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

    void loadNotes();

    return () => controller.abort();
  }, []);

  async function create(input: CreateNoteInput): Promise<boolean> {
    setIsCreating(true);
    setErrorMessage(null);

    try {
      const note = await createNote(input);
      setNotes((currentNotes) => [...currentNotes, note]);
      return true;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return false;
    } finally {
      setIsCreating(false);
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

    setNotes((currentNotes) => currentNotes.filter((note) => note.id !== id));
    return true;
  }

  return { notes, isLoading, isCreating, pendingNoteIds, errorMessage, create, update, remove };
}