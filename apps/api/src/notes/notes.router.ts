import { Router } from 'express';

import type { NotesService } from './notes.service.js';

export function createNotesRouter(notesService: NotesService) {
  const router = Router();

  router.get('/', async (_request, response) => {
    response.status(200).json({ notes: await notesService.list() });
  });

  router.post('/', async (request, response) => {
    const result = await notesService.create(request.body);

    if (!result.success) {
      response.status(400).json({ error: 'title and content must be non-empty strings' });
      return;
    }

    response.status(201).json({ note: result.note });
  });

  router.patch('/:id', async (request, response) => {
    const result = await notesService.update(request.params.id, request.body);

    if (!result.success) {
      const status = result.error === 'INVALID_INPUT' ? 400 : 404;
      const error = result.error === 'INVALID_INPUT' ? 'invalid note input' : 'note not found';
      response.status(status).json({ error });
      return;
    }

    response.status(200).json({ note: result.note });
  });

  router.delete('/:id', async (request, response) => {
    const result = await notesService.delete(request.params.id);

    if (!result.success) {
      const status = result.error === 'INVALID_INPUT' ? 400 : 404;
      const error = result.error === 'INVALID_INPUT' ? 'invalid note id' : 'note not found';
      response.status(status).json({ error });
      return;
    }

    response.status(204).end();
  });

  return router;
}