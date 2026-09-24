import { beforeEach, describe, expect, it } from 'vitest';

import { createInMemoryNotesRepository } from './notes.repository.js';
import { createNotesService, type NotesService } from './notes.service.js';

describe('NotesService', () => {
  let service: NotesService;

  beforeEach(() => {
    service = createNotesService(createInMemoryNotesRepository());
  });

  it('normalizes valid input before creating a note', () => {
    const result = service.create({ title: '  Architecture  ', content: '  Keep it simple.  ' });

    expect(result).toMatchObject({
      success: true,
      note: {
        title: 'Architecture',
        content: 'Keep it simple.',
      },
    });
  });

  it('rejects invalid input without creating a note', () => {
    expect(service.create({ title: '', content: 'Content' })).toEqual({
      success: false,
      error: 'INVALID_INPUT',
    });
    expect(service.list()).toEqual([]);
  });
});