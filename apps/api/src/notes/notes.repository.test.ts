import { describe, expect, it } from 'vitest';

import { createInMemoryNotesRepository } from './notes.repository.js';

describe('notes source URL', () => {
  it('leaves manual notes without a source', async () => {
    const repository = createInMemoryNotesRepository();
    const note = await repository.create({ title: 'Manual', content: 'My own notes' });

    expect(note.sourceUrl).toBeNull();
    await expect(repository.list()).resolves.toEqual([note]);
  });

  it('preserves a source URL when editing a generated note', async () => {
    const repository = createInMemoryNotesRepository();
    const note = await repository.create({
      title: 'React', content: 'Use hooks.', sourceUrl: 'https://react.dev/learn',
    });

    expect(note.sourceUrl).toBe('https://react.dev/learn');
    const edited = await repository.update(note.id, { title: 'React notes', content: 'Use hooks.' });
    expect(edited?.sourceUrl).toBe(note.sourceUrl);
    await expect(repository.list()).resolves.toEqual([edited]);
  });
});