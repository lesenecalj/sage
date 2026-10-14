import {
  noteGenerationJobResponseSchema,
  noteGenerationJobsResponseSchema,
  noteSchema,
  type Note,
  type NoteGenerationJob,
} from '@sage/contracts';
import { z } from 'zod';

export type { Note, NoteGenerationJob } from '@sage/contracts';

export type CreateNoteInput = Pick<Note, 'title' | 'content'>;
export type GenerateNoteInput = { url: string; instruction: string };
export type NoteGenerationSubmission = { job: NoteGenerationJob; eventsUrl: string };

const notesResponseSchema = z.object({ notes: z.array(noteSchema) }).strict();
const noteResponseSchema = z.object({ note: noteSchema }).strict();
const errorResponseSchema = z.object({ error: z.string() }).strict();
const trackingErrorSchema = z.object({ error: z.string(), retryable: z.boolean().optional() }).strict();

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

export async function createNoteGeneration(input: GenerateNoteInput): Promise<NoteGenerationSubmission> {
  const response = await fetch('/api/note-generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    return throwApiError(response);
  }

  const body = await parseResponse(response, noteGenerationJobResponseSchema);
  const location = response.headers.get('Location');
  let trackingUrl: URL | undefined;
  try {
    if (location) trackingUrl = new URL(location, window.location.origin);
  } catch {
    trackingUrl = undefined;
  }
  if (!trackingUrl || trackingUrl.origin !== window.location.origin) {
    throw new ApiError('The API returned an invalid generation tracking URL.', response.status);
  }

  return {
    job: body.job,
    eventsUrl: `/api${trackingUrl.pathname}${trackingUrl.search}${trackingUrl.hash}`,
  };
}

export async function listNoteGenerations(signal?: AbortSignal): Promise<NoteGenerationJob[]> {
  const response = await fetch('/api/note-generations', { signal });

  if (!response.ok) return throwApiError(response);

  const body = await parseResponse(response, noteGenerationJobsResponseSchema);
  return body.jobs;
}

export function noteGenerationEventsUrl(id: string): string {
  return `/api/note-generations/${id}/events`;
}

export function subscribeToNoteGenerationEvents(
  eventsUrl: string,
  onJob: (job: NoteGenerationJob) => void,
  onError: (error: Error, retryable: boolean) => void,
): EventSource {
  const events = new EventSource(eventsUrl);

  events.addEventListener('job', (event) => {
    try {
      const message = event as MessageEvent<string>;
      const result = noteGenerationJobResponseSchema.safeParse(JSON.parse(message.data));
      if (!result.success) throw new Error('The API returned an invalid generation update.');
      onJob(result.data.job);
      if (result.data.job.status === 'completed' || result.data.job.status === 'failed') {
        events.close();
      }
    } catch (error) {
      events.close();
      onError(error instanceof Error ? error : new Error('Invalid generation update.'), false);
    }
  });

  events.addEventListener('error', (event) => {
    if (!(event instanceof MessageEvent)) {
      if (events.readyState === EventSource.CLOSED) {
        onError(new Error('Generation tracking disconnected. Reload to reconnect.'), false);
      }
      return;
    }
    try {
      const result = trackingErrorSchema.safeParse(JSON.parse(event.data));
      if (!result.success || result.data.retryable !== true) events.close();
      onError(
        new ApiError(result.success ? result.data.error : 'Generation tracking failed.', 500),
        result.success && result.data.retryable === true,
      );
    } catch (error) {
      events.close();
      onError(new Error('The API returned an invalid tracking error.'), false);
    }
  });

  return events;
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