import { describe, expect, it, vi } from 'vitest';

import { extractHtml, readWebPage } from './web-page.js';

const html = (body: string) => new Response(body, {
  headers: { 'content-type': 'text/html; charset=utf-8' },
});

describe('page reading', () => {
  it('extracts title and main text without navigation or scripts', () => {
    expect(extractHtml(
      '<title>React guide</title><nav>Menu</nav><main><h1>Hooks</h1><p>Use them in components.</p><script>ignore()</script></main>',
      new URL('https://react.dev/learn'),
    )).toEqual({
      title: 'React guide', text: 'Hooks\nUse them in components.', url: 'https://react.dev/learn',
    });
  });

  it('does not repeat text inside nested content blocks', () => {
    expect(extractHtml(
      '<main><ul><li><p>Use hooks.</p></li><li>Keep components focused.</li></ul></main>',
      new URL('https://react.dev/learn'),
    ).text).toBe('Use hooks.\nKeep components focused.');
  });

  it('uses article content when main is empty', () => {
    expect(extractHtml(
      '<main> </main><article><h1>React</h1><p>Prefer composition.</p></article>',
      new URL('https://react.dev/learn'),
    ).text).toBe('React\nPrefer composition.');
  });

  it.each(['file:///etc/passwd', 'http://localhost/', 'http://127.0.0.1/',
    'http://[::1]/', 'https://example.local/'])('rejects an obvious local URL: %s', async (url) => {
    const fetchPage = vi.fn();
    await expect(readWebPage(url, fetchPage)).rejects.toMatchObject({ reason: 'INVALID_URL' });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('checks redirect destinations and records the final source', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/guide' } }))
      .mockResolvedValueOnce(html('<title>Guide</title><main><p>Read this.</p></main>'));

    await expect(readWebPage('https://example.com/', fetchPage)).resolves.toEqual({
      title: 'Guide', text: 'Read this.', url: 'https://example.com/guide',
    });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls[1]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('does not follow a redirect to localhost', async () => {
    const fetchPage = vi.fn().mockResolvedValue(new Response(null, {
      status: 302, headers: { location: 'http://localhost/private' },
    }));
    await expect(readWebPage('https://example.com/', fetchPage)).rejects.toMatchObject({ reason: 'INVALID_URL' });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'non-HTML', response: new Response('PDF', { headers: { 'content-type': 'application/pdf' } }) },
    { name: 'empty page', response: html('<script>only scripts</script>') },
    { name: 'oversized page', response: html('x'.repeat(512_001)) },
  ])('rejects $name', async ({ response }) => {
    await expect(readWebPage('https://example.com/', vi.fn().mockResolvedValue(response)))
      .rejects.toMatchObject({ reason: 'UNREADABLE' });
  });

  it('limits redirect chains', async () => {
    const fetchPage = vi.fn().mockResolvedValue(new Response(null, {
      status: 302, headers: { location: '/again' },
    }));
    await expect(readWebPage('https://example.com/', fetchPage)).rejects.toMatchObject({ reason: 'UNREADABLE' });
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });

  it('reports a timed-out request', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => AbortSignal.abort());
    try {
      await expect(readWebPage('https://example.com/', async () => {
        throw new Error('aborted');
      })).rejects.toMatchObject({ reason: 'TIMEOUT' });
    } finally {
      timeout.mockRestore();
    }
  });
});