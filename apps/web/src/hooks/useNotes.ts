import { useEffect, useState } from 'react';

import {
  ApiError,
  createNote,
  listNotes,
  type CreateNoteInput,
  type Note,
} from '../api/notes';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadNotes() {
      try {
        const loadedNotes = await listNotes(controller.signal);
        setNotes(loadedNotes);
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

  return { notes, isLoading, isCreating, errorMessage, create };
}