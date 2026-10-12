import type { NoteGenerationJob } from '@sage/contracts';

export type SubmitNoteGenerationResult =
  | { success: true; job: NoteGenerationJob }
  | { success: false; error: 'INVALID_INPUT' };

export type NoteGenerationEvent =
  | { type: 'progress'; stage: 'reading_page' | 'summarizing' | 'saving_note' }
  | { type: 'state_changed' }
  | { type: 'tracking_error' };

export type NoteGenerationJobs = {
  waitUntilReady(): Promise<void>;
  close(): Promise<void>;
  submit(input: unknown): Promise<SubmitNoteGenerationResult>;
  get(id: string): Promise<NoteGenerationJob | null>;
  list(): Promise<NoteGenerationJob[]>;
  subscribe(id: string, listener: (event: NoteGenerationEvent) => void): () => void;
};