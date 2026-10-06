import { afterEach, describe, expect, it, vi } from 'vitest';

import { summarizeWithOllama } from './ollama-note-summarizer.js';

const page = {
  title: 'React guide',
  text: 'Prefer composition.',
  url: 'https://react.dev/learn',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Ollama note summarizer', () => {
  it('sends the instruction and page text to the local model', async () => {
    vi.stubEnv('OLLAMA_MODEL', 'llama3.2');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: { content: '  A summary.  ' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(summarizeWithOllama(page, 'Summarize React practices')).resolves.toBe('A summary.');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(options).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(options.body as string)).toMatchObject({
      model: 'llama3.2',
      stream: false,
      messages: [expect.any(Object), {
        role: 'user',
        content: JSON.stringify({ instruction: 'Summarize React practices', pageText: page.text }),
      }],
    });
  });

  it('rejects model errors, invalid responses, and empty responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ message: { content: '  ' } }))
      .mockResolvedValueOnce(Response.json({ message: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(summarizeWithOllama(page, 'Summarize')).rejects.toThrow('Local Ollama model request failed.');
    await expect(summarizeWithOllama(page, 'Summarize')).rejects.toThrow('empty summary');
    await expect(summarizeWithOllama(page, 'Summarize')).rejects.toThrow('empty summary');
  });
});