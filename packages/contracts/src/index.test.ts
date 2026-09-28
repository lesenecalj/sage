import { describe, expect, it } from 'vitest';

import { noteSchema, type Note } from './index.js';

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