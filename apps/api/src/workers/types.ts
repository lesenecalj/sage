import type { NoteGenerationJob } from '@sage/contracts';
import type { FromUrlInput } from '../notes/generation/from-url.input.js';

export type NoteGenerationEvent =
  | { type: 'progress'; stage: 'reading_page' | 'summarizing' | 'saving_note' }
  | { type: 'state_changed' }
  | { type: 'tracking_error' };

export type NoteGenerationJobs = {
  waitUntilReady(): Promise<void>;
  close(): Promise<void>;
  submit(input: FromUrlInput): Promise<NoteGenerationJob>;
  get(id: string): Promise<NoteGenerationJob | null>;
  list(): Promise<NoteGenerationJob[]>;
  subscribe(id: string, listener: (event: NoteGenerationEvent) => void): () => void;
};