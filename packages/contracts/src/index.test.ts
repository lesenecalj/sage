import { describe, expect, it } from 'vitest';

import {
  noteGenerationJobSchema,
  noteSchema,
  type Note,
  type NoteGenerationJob,
} from './index.js';

const note: Note = {
  id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45',
  title: 'React',
  content: 'Prefer composition.',
  sourceUrl: null,
  createdAt: '2026-09-27T12:00:00.000Z',
};

describe('note response contract', () => {
  it('accepts manual and sourced notes', () => {
    expect(noteSchema.parse(note)).toEqual(note);
    const sourced = { ...note, sourceUrl: 'https://react.dev/learn' };
    expect(noteSchema.parse(sourced)).toEqual(sourced);
  });

  it('rejects missing or extra fields', () => {
    const { sourceUrl: _sourceUrl, ...withoutSource } = note;
    expect(noteSchema.safeParse(withoutSource).success).toBe(false);
    expect(noteSchema.safeParse({ ...note, extra: true }).success).toBe(false);
  });
});

describe('note generation job contract', () => {
  const job: NoteGenerationJob = {
    id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45',
    status: 'running',
    stage: 'summarizing',
    noteId: null,
    error: null,
    createdAt: '2026-09-27T12:00:00.000Z',
    finishedAt: null,
  };

  it('accepts active and terminal job snapshots', () => {
    expect(noteGenerationJobSchema.parse(job)).toEqual(job);
    expect(noteGenerationJobSchema.parse({
      ...job,
      status: 'completed',
      stage: 'completed',
      noteId: job.id,
      finishedAt: '2026-09-27T12:01:00.000Z',
    })).toMatchObject({ status: 'completed', noteId: job.id });
  });

  it('rejects unknown state and extra fields', () => {
    expect(noteGenerationJobSchema.safeParse({ ...job, status: 'retrying' }).success).toBe(false);
    expect(noteGenerationJobSchema.safeParse({ ...job, extra: true }).success).toBe(false);
  });
});