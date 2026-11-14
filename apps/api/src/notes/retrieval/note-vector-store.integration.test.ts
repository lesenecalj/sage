import { randomUUID } from 'node:crypto';

import { Embeddings } from '@langchain/core/embeddings';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createNoteVectorDocuments, createNoteVectorStore } from './note-vector-store.js';

const describePostgres = process.env.RUN_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;
const dimensions = 768;
const fixedVector = Array.from({ length: dimensions }, (_, index) => index === 0 ? 1 : 0);

class FixedEmbeddings extends Embeddings {
  constructor() {
    super({});
  }

  override embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map(() => fixedVector));
  }

  override embedQuery(): Promise<number[]> {
    return Promise.resolve(fixedVector);
  }
}

describePostgres('LangChain PGVectorStore', () => {
  const tableName = `sage_vectors_test_${randomUUID().replaceAll('-', '')}`;
  let store: Awaited<ReturnType<typeof createNoteVectorStore>> | undefined;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
    store = await createNoteVectorStore(new FixedEmbeddings(), databaseUrl, tableName);
  });

  afterAll(async () => {
    if (!store) return;
    await store.pool.query(`DROP TABLE IF EXISTS ${store.computedTableName}`);
    await store.end();
  });

  it('stores, filters, searches, and deletes note documents through the library', async () => {
    if (!store) throw new Error('PGVectorStore was not initialized.');
    const noteId = randomUUID();
    const revision = randomUUID();
    const note = {
      id: noteId,
      title: 'Vector integration',
      content: 'A source passage stored in the LangChain vector store.',
      sourceUrl: 'https://example.com/vector',
      indexingRevision: revision,
    };
    const [document] = await createNoteVectorDocuments(note);
    if (!document) throw new Error('Expected one vector document.');

    try {
      await store.addDocuments([document], { ids: [randomUUID()] });
      const results = await store.similaritySearch('find the source passage', 1, {
        noteId,
        sourceRevision: revision,
      });

      expect(results).toHaveLength(1);
      const result = results[0];
      if (!result) throw new Error('Expected one search result.');
      expect(result.metadata.sourceTextOffset).toEqual(expect.any(Number));
      expect(result.pageContent.slice(result.metadata.sourceTextOffset)).toBe(note.content);
      expect(results[0]?.metadata).toMatchObject({ noteId, sourceRevision: revision });

      await store.delete({ filter: { noteId, sourceRevision: revision } });
      await expect(store.similaritySearch('find the source passage', 1, { noteId })).resolves.toEqual([]);
    } finally {
      await store.delete({ filter: { noteId } });
    }
  });
});