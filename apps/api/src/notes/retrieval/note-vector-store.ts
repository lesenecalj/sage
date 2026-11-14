import { Document } from '@langchain/core/documents';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { PGVectorStore } from '@langchain/pgvector';

import { RETRIEVAL_PIPELINE_VERSION, splitNoteContent } from './note-splitter.js';

export type NoteForIndexing = {
  id: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  indexingRevision: string;
};

export type NoteVectorMetadata = {
  noteId: string;
  sourceRevision: string;
  pipelineVersion: string;
  ordinal: number;
  title: string;
  sourceUrl: string | null;
  sourceTextOffset: number;
};

export async function createNoteVectorDocuments(note: NoteForIndexing): Promise<Document<NoteVectorMetadata>[]> {
  const chunks = await splitNoteContent(note.content);
  const titleContext = note.title.slice(0, 200);
  const titlePrefix = titleContext ? `${titleContext}\n\n` : '';

  return chunks.map((sourceText, ordinal) => new Document<NoteVectorMetadata>({
    pageContent: `${titlePrefix}${sourceText}`,
    metadata: {
      noteId: note.id,
      sourceRevision: note.indexingRevision,
      pipelineVersion: RETRIEVAL_PIPELINE_VERSION,
      ordinal,
      title: note.title,
      sourceUrl: note.sourceUrl,
      sourceTextOffset: titlePrefix.length,
    },
  }));
}

export function getNoteVectorCitationText(document: Document<NoteVectorMetadata>): string {
  return document.pageContent.slice(document.metadata.sourceTextOffset);
}

export function createNoteVectorStore(
  embeddings: EmbeddingsInterface,
  databaseUrl: string,
  tableName = 'sage_note_vectors',
): Promise<PGVectorStore> {
  return PGVectorStore.initialize(embeddings, {
    postgresConnectionOptions: { connectionString: databaseUrl },
    tableName,
    dimensions: 768,
    distanceStrategy: 'cosine',
    scoreNormalization: 'distance',
  });
}