import { OllamaEmbeddings } from '@langchain/ollama';

export type NomicOllamaEmbeddingsOptions = {
  model: string;
  baseUrl: string;
  fetch?: typeof fetch;
};

export class NomicOllamaEmbeddings extends OllamaEmbeddings {
  constructor({ model, baseUrl, fetch }: NomicOllamaEmbeddingsOptions) {
    super({ model, baseUrl, ...(fetch ? { fetch } : {}), truncate: false });
  }

  override embedDocuments(texts: string[]): Promise<number[][]> {
    return super.embedDocuments(texts.map((text) => `search_document: ${text}`));
  }

  override embedQuery(text: string): Promise<number[]> {
    return super.embedQuery(`search_query: ${text}`);
  }
}