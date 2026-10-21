import { describe, expect, it, vi } from 'vitest';

import { createPrismaNotesRepository } from './notes.repository.js';

describe('Prisma notes repository', () => {
  it('requests newest notes first with a stable ID tie-breaker', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = createPrismaNotesRepository({ note: { findMany } } as never);

    await repository.list();

    expect(findMany).toHaveBeenCalledExactlyOnceWith({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('uses an upsert with the job ID for idempotent generated-note writes', async () => {
    const jobId = '7d5b9456-eb94-414f-a129-da4aa1bb2c45';
    const input = { title: 'React', content: 'Use hooks.', sourceUrl: 'https://react.dev/learn' };
    const record = {
      ...input,
      id: jobId,
      createdAt: new Date('2026-09-27T12:00:00.000Z'),
      updatedAt: new Date('2026-09-27T12:00:00.000Z'),
    };
    const upsert = vi.fn().mockResolvedValue(record);
    const repository = createPrismaNotesRepository({ note: { upsert } } as never);

    const note = await repository.createGenerated(jobId, input);

    expect(upsert).toHaveBeenCalledExactlyOnceWith({
      where: { id: jobId },
      update: {},
      create: { ...input, id: jobId },
    });
    expect(note).toMatchObject({ id: jobId, title: input.title, sourceUrl: input.sourceUrl });
  });

  it('marks changed notes pending with a fresh revision without exposing indexing metadata', async () => {
    const id = '7d5b9456-eb94-414f-a129-da4aa1bb2c45';
    const previousRevision = 'previous-revision';
    const input = { title: 'Updated', content: 'Changed content.' };
    const update = vi.fn().mockResolvedValue({
      ...input,
      id,
      sourceUrl: null,
      createdAt: new Date('2026-09-27T12:00:00.000Z'),
      updatedAt: new Date('2026-09-27T12:01:00.000Z'),
      indexingRevision: previousRevision,
      indexingStatus: 'ready',
      indexingError: null,
    });
    const repository = createPrismaNotesRepository({ note: { update } } as never);

    const note = await repository.update(id, input);

    expect(update).toHaveBeenCalledExactlyOnceWith({
      where: { id },
      data: {
        ...input,
        indexingRevision: expect.any(String),
        indexingStatus: 'pending',
        indexingError: null,
      },
    });
    const updateCall = update.mock.calls[0];
    if (!updateCall) throw new Error('Expected the note update call.');
    expect(updateCall[0].data.indexingRevision).not.toBe(previousRevision);
    expect(note).not.toHaveProperty('indexingRevision');
    expect(note).not.toHaveProperty('indexingStatus');
  });

  it('reads the persisted indexing revision without selecting public note data', async () => {
    const findUnique = vi.fn().mockResolvedValue({ indexingRevision: 'revision-1' });
    const repository = createPrismaNotesRepository({ note: { findUnique } } as never);

    await expect(repository.getIndexingRevision('note-1')).resolves.toBe('revision-1');
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'note-1' },
      select: { indexingRevision: true },
    });
  });
});