import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryNotesRepository } from './notes.repository.js';
import { createNotesService, type NotesService } from './notes.service.js';

const page = {
  title: 'React guide',
  text: 'Prefer composition.',
  url: 'https://react.dev/learn',
};
const input = { url: 'https://react.dev/', instruction: 'Summarize React practices' };

describe('NotesService', () => {
  let service: NotesService;

  beforeEach(() => {
    service = createNotesService(createInMemoryNotesRepository(), { summarize: async () => '' });
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

  it('rejects invalid URL note input without calling the generator', async () => {
    const readPage = vi.fn();
    const summarize = vi.fn();
    service = createNotesService(createInMemoryNotesRepository(), { readPage, summarize });

    await expect(service.generateFromUrl({ url: 'file:///etc/passwd', instruction: 'Summarize' }))
      .resolves.toEqual({ success: false, error: 'INVALID_INPUT' });
    expect(readPage).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
  });

  it('saves the generated summary and final page URL', async () => {
    const repository = createInMemoryNotesRepository();
    const create = vi.spyOn(repository, 'create');
    const readPage = vi.fn().mockResolvedValue(page);
    const summarize = vi.fn().mockResolvedValue('  Prefer composition.  ');
    service = createNotesService(repository, { readPage, summarize });

    const result = await service.generateFromUrl(input);

    expect(result).toMatchObject({
      success: true,
      note: { title: page.title, content: 'Prefer composition.', sourceUrl: page.url },
    });
    expect(readPage).toHaveBeenCalledWith(input.url);
    expect(summarize).toHaveBeenCalledWith(page, input.instruction);
    expect(create).toHaveBeenCalledExactlyOnceWith({
      title: page.title,
      content: 'Prefer composition.',
      sourceUrl: page.url,
    });
  });

  it.each(['reading', 'summarizing'] as const)('does not save a note when %s fails', async (stage) => {
    const repository = createInMemoryNotesRepository();
    const create = vi.spyOn(repository, 'create');
    const readPage = stage === 'reading'
      ? vi.fn().mockRejectedValue(new Error('Page unavailable'))
      : vi.fn().mockResolvedValue(page);
    const summarize = stage === 'summarizing'
      ? vi.fn().mockRejectedValue(new Error('Model unavailable'))
      : vi.fn().mockResolvedValue('Summary');
    service = createNotesService(repository, { readPage, summarize });

    await expect(service.generateFromUrl(input)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    if (stage === 'reading') expect(summarize).not.toHaveBeenCalled();
    await expect(repository.list()).resolves.toEqual([]);
  });

  it('does not save an empty summary', async () => {
    const repository = createInMemoryNotesRepository();
    const create = vi.spyOn(repository, 'create');
    service = createNotesService(repository, {
      readPage: async () => page,
      summarize: async () => '  ',
    });

    await expect(service.generateFromUrl(input)).rejects.toThrow('empty summary');
    expect(create).not.toHaveBeenCalled();
    await expect(repository.list()).resolves.toEqual([]);
  });

});