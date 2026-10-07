import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';

import type { NoteGenerationJobs } from './notes/note-generation-jobs.port.js';
import { createNoteGenerationRouter } from './notes/note-generation.router.js';
import { createNotesRouter } from './notes/notes.router.js';
import type { NotesService } from './notes/notes.service.js';

function isInvalidJsonBody(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  );
}

type AppDependencies = {
  notesService: NotesService;
  noteGenerationJobs: NoteGenerationJobs;
};

export function createApp({ notesService, noteGenerationJobs }: AppDependencies) {
  const app = express();

  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json({ limit: '1mb', strict: false }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.use('/notes', createNotesRouter(notesService));
  app.use('/note-generations', createNoteGenerationRouter(noteGenerationJobs));

  const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    if (isInvalidJsonBody(error)) {
      response.status(400).json({ error: 'invalid JSON body' });
      return;
    }

    if (response.headersSent) {
      next(error);
      return;
    }

    console.error(error);
    response.status(500).json({ error: 'internal server error' });
  };

  app.use(errorHandler);

  return app;
}