import { isIP } from 'node:net';

import { load } from 'cheerio';

const maxBytes = 512_000;
const maxCharacters = 16_000;
const maxRedirects = 3;

export type WebPage = { title: string; text: string; url: string };

export class WebPageError extends Error {
  constructor(readonly reason: 'INVALID_URL' | 'UNREADABLE' | 'TIMEOUT') {
    super(reason);
  }
}

function validateWebUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new WebPageError('INVALID_URL');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || !hostname ||
    hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') || hostname.endsWith('.internal') ||
    isIP(hostname) !== 0 || url.username || url.password) {
    throw new WebPageError('INVALID_URL');
  }

  url.hash = '';
  return url;
}

export function extractHtml(html: string, url: URL): WebPage {
  const $ = load(html);
  const title = $('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 160) || url.hostname;
  $('script, style, noscript, nav, footer, header, aside, form, svg').remove();

  const main = $('main').first();
  const article = $('article').first();
  const content = [main, article, $('body')].find((candidate) => candidate.text().trim()) ?? $('body');
  const blockSelector = 'h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, td';
  const blocks = content.find(blockSelector).filter((_, element) =>
    !$(element).parentsUntil(content).is(blockSelector));
  const text = (blocks.length
    ? blocks.map((_, element) => $(element).text().replace(/\s+/g, ' ').trim()).get().join('\n')
    : content.text().replace(/\s+/g, ' ').trim()).trim().slice(0, maxCharacters);

  if (!text) throw new WebPageError('UNREADABLE');
  return { title, text, url: url.href };
}

export async function readWebPage(input: string, fetchPage: typeof fetch = fetch): Promise<WebPage> {
  let url = validateWebUrl(input);
  const signal = AbortSignal.timeout(15_000);

  try {
    for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
      const response = await fetchPage(url, {
        signal,
        redirect: 'manual',
        headers: { accept: 'text/html' },
      });

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirects === maxRedirects) throw new WebPageError('UNREADABLE');
        url = validateWebUrl(new URL(location, url).href);
        continue;
      }

      if (!response.ok || !/^text\/html(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '') ||
        Number(response.headers.get('content-length') ?? 0) > maxBytes || !response.body) {
        await response.body?.cancel();
        throw new WebPageError('UNREADABLE');
      }

      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > maxBytes) throw new WebPageError('UNREADABLE');
        chunks.push(chunk);
      }

      return extractHtml(Buffer.concat(chunks).toString('utf8'), url);
    }
  } catch (error) {
    if (signal.aborted) throw new WebPageError('TIMEOUT');
    if (error instanceof WebPageError) throw error;
    throw new WebPageError('UNREADABLE');
  }
  throw new WebPageError('UNREADABLE');
}