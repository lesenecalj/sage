import { noteSchema, type Note } from '@sage/contracts';
import { z } from 'zod';

export type { Note } from '@sage/contracts';

export type CreateNoteInput = Pick<Note, 'title' | 'content'>;
export type GenerateNoteInput = { url: string; instruction: string };

const notesResponseSchema = z.object({ notes: z.array(noteSchema) }).strict();
const noteResponseSchema = z.object({ note: noteSchema }).strict();
const errorResponseSchema = z.object({ error: z.string() }).strict();

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
  const body = await response.json().catch(() => null);
  const result = errorResponseSchema.safeParse(body);

  throw new ApiError(result.success ? result.data.error : 'An unexpected API error occurred.', response.status);
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body = await response.json().catch(() => null);
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new ApiError('The API returned an invalid response.', response.status);
  }

  return result.data;
}

export async function listNotes(signal?: AbortSignal): Promise<Note[]> {
  const response = await fetch('/api/notes', { signal });

  if (!response.ok) {
    return throwApiError(response);
  }

  const body = await parseResponse(response, notesResponseSchema);
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

  const body = await parseResponse(response, noteResponseSchema);
  return body.note;
}

export async function generateNoteFromUrl(input: GenerateNoteInput): Promise<Note> {
  const response = await fetch('/api/notes/from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    return throwApiError(response);
  }

  const body = await parseResponse(response, noteResponseSchema);
  return body.note;
}

export async function updateNote(id: string, input: CreateNoteInput): Promise<Note> {
  const response = await fetch(`/api/notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    return throwApiError(response);
  }

  const body = await parseResponse(response, noteResponseSchema);
  return body.note;
}

export async function deleteNote(id: string): Promise<void> {
  const response = await fetch(`/api/notes/${id}`, { method: 'DELETE' });

  if (!response.ok) {
    return throwApiError(response);
  }
}