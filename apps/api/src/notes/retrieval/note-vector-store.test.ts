import { describe, expect, it } from 'vitest';

import { RETRIEVAL_PIPELINE_VERSION } from './note-splitter.js';
import { createNoteVectorDocuments, getNoteVectorCitationText } from './note-vector-store.js';

describe('createNoteVectorDocuments', () => {
  it('attaches note revision and source metadata to each LangChain document', async () => {
    const note = {
      id: 'note-1',
      title: 'Retrieval notes',
      content: 'A short note about retrieval.',
      sourceUrl: 'https://example.com/retrieval',
      indexingRevision: 'revision-1',
    };

    const documents = await createNoteVectorDocuments(note);

    expect(documents).toHaveLength(1);
    expect(documents[0]?.pageContent).toBe(`${note.title}\n\n${note.content}`);
    expect(documents[0]?.metadata).toEqual({
      noteId: note.id,
      sourceRevision: note.indexingRevision,
      pipelineVersion: RETRIEVAL_PIPELINE_VERSION,
      ordinal: 0,
      title: note.title,
      sourceUrl: note.sourceUrl,
      sourceTextOffset: note.title.length + 2,
    });
    expect(documents[0] && getNoteVectorCitationText(documents[0])).toBe(note.content);
  });

  it('bounds long titles in embedding context while retaining the source passage', async () => {
    const note = {
      id: 'note-2',
      title: 'Long title '.repeat(30),
      content: 'Exact passage for citation.',
      sourceUrl: null,
      indexingRevision: 'revision-2',
    };

    const [document] = await createNoteVectorDocuments(note);

    expect(document?.pageContent).toBe(`${note.title.slice(0, 200)}\n\n${note.content}`);
    expect(document && getNoteVectorCitationText(document)).toBe(note.content);
  });
});