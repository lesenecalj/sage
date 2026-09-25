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

  return router;
}