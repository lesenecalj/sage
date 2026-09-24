import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';

import { createInMemoryNotesRepository } from './notes/notes.repository.js';
import { createNotesRouter } from './notes/notes.router.js';
import { createNotesService } from './notes/notes.service.js';

function isInvalidJsonBody(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  );
}

export function createApp() {
  const app = express();
  const notesRepository = createInMemoryNotesRepository();
  const notesService = createNotesService(notesRepository);

  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json({ limit: '1mb', strict: false }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.use('/notes', createNotesRouter(notesService));

  const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    if (isInvalidJsonBody(error)) {
      response.status(400).json({ error: 'invalid JSON body' });
      return;
    }

    next(error);
  };

  app.use(errorHandler);

  return app;
}