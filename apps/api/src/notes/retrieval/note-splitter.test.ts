import { describe, expect, it } from 'vitest';

import { splitNoteContent } from './note-splitter.js';

describe('splitNoteContent', () => {
  it('uses the recursive splitter to keep paragraphs together and bound chunk size', async () => {
    const firstParagraph = 'Alpha paragraph. '.repeat(60);
    const secondParagraph = 'Beta paragraph. '.repeat(60);
    const chunks = await splitNoteContent(`${firstParagraph}\n\n${secondParagraph}`);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1800)).toBe(true);
    expect(chunks.join(' ')).toContain('Alpha paragraph.');
    expect(chunks.join(' ')).toContain('Beta paragraph.');
  });

  it('handles long text without separators using the configured overlap', async () => {
    const content = 'x'.repeat(5200);
    const chunks = await splitNoteContent(content);

    expect(chunks.every((chunk) => chunk.length <= 1800)).toBe(true);
    expect(chunks.every((chunk) => content.includes(chunk))).toBe(true);
    for (let index = 1; index < chunks.length; index += 1) {
      const previousChunk = chunks[index - 1];
      const chunk = chunks[index];
      if (!previousChunk || !chunk) throw new Error('Expected adjacent chunks.');
      expect(chunk.startsWith(previousChunk.slice(-200))).toBe(true);
    }
  });

  it('returns no chunks for empty or whitespace-only notes', async () => {
    await expect(splitNoteContent('')).resolves.toEqual([]);
    await expect(splitNoteContent(' \n\t ')).resolves.toEqual([]);
  });
});