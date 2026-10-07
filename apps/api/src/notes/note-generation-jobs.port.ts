import type { NoteGenerationJob } from '@sage/contracts';

export type SubmitNoteGenerationResult =
  | { success: true; job: NoteGenerationJob }
  | { success: false; error: 'INVALID_INPUT' };

export type NoteGenerationJobs = {
  waitUntilReady(): Promise<void>;
  close(): Promise<void>;
  submit(input: unknown): Promise<SubmitNoteGenerationResult>;
  get(id: string): Promise<NoteGenerationJob | null>;
  list(): Promise<NoteGenerationJob[]>;
  subscribe(id: string, listener: () => void): () => void;
};