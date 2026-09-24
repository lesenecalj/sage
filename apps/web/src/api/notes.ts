export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};

export type CreateNoteInput = Pick<Note, 'title' | 'content'>;

type NotesResponse = {
  notes: Note[];
};

type NoteResponse = {
  note: Note;
};

type ErrorResponse = {
  error: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function throwApiError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => null)) as ErrorResponse | null;
  throw new ApiError(body?.error ?? 'An unexpected API error occurred.', response.status);
}

export async function listNotes(signal?: AbortSignal): Promise<Note[]> {
  const response = await fetch('/api/notes', { signal });

  if (!response.ok) {
    return throwApiError(response);
  }

  const body = (await response.json()) as NotesResponse;
  return body.notes;
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  const response = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    return throwApiError(response);
  }

  const body = (await response.json()) as NoteResponse;
  return body.note;
}