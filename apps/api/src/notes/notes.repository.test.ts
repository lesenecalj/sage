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
});