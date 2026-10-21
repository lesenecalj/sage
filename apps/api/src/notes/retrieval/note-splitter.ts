import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export const RETRIEVAL_PIPELINE_VERSION = 'nomic-v1.5-recursive-character-1800-200-title-200-v2';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1800,
  chunkOverlap: 200,
});

export function splitNoteContent(content: string): Promise<string[]> {
  if (!content.trim()) return Promise.resolve([]);
  return splitter.splitText(content);
}