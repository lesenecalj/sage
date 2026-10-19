import { describe, expect, it } from 'vitest';

import { NomicOllamaEmbeddings } from './nomic-ollama-embeddings.js';

describe('NomicOllamaEmbeddings', () => {
  it('uses Nomic task prefixes and disables silent input truncation', async () => {
    const requests: Array<{ model: string; input: string[]; truncate: boolean }> = [];
    const fetcher: typeof fetch = async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)) as typeof requests[number]);
      return new Response(JSON.stringify({ embeddings: [[1, 0], [0, 1]] }), {
        headers: { 'content-type': 'application/json' },
      });
    };
    const embeddings = new NomicOllamaEmbeddings({
      model: 'nomic-embed-text:v1.5',
      baseUrl: 'http://localhost:11434',
      fetch: fetcher,
    });

    await embeddings.embedDocuments(['first passage', 'second passage']);
    await embeddings.embedQuery('find a passage');

    expect(requests).toEqual([
      {
        model: 'nomic-embed-text:v1.5',
        input: ['search_document: first passage', 'search_document: second passage'],
        truncate: false,
      },
      {
        model: 'nomic-embed-text:v1.5',
        input: ['search_query: find a passage'],
        truncate: false,
      },
    ]);
  });
});