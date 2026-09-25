import { beforeEach, describe, expect, it } from 'vitest';

import { createInMemoryNotesRepository } from './notes.repository.js';
import { createNotesService, type NotesService } from './notes.service.js';

describe('NotesService', () => {
  let service: NotesService;

  beforeEach(() => {
    service = createNotesService(createInMemoryNotesRepository());
  });

  it('normalizes valid input before creating a note', async () => {
    const result = await service.create({ title: '  Architecture  ', content: '  Keep it simple.  ' });

    expect(result).toMatchObject({
      success: true,
      note: {
        title: 'Architecture',
        content: 'Keep it simple.',
      },
    });
  });

  it('rejects invalid input without creating a note', async () => {
    await expect(service.create({ title: '', content: 'Content' })).resolves.toEqual({
      success: false,
      error: 'INVALID_INPUT',
    });
    await expect(service.list()).resolves.toEqual([]);
  });
});