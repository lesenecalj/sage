import { Router } from 'express';
import { z } from 'zod';

import { createNoteGenerationEventsHandler } from './note-generation-events.handler.js';
import type { NoteGenerationJobs } from './note-generation-jobs.port.js';

const jobIdSchema = z.string().uuid();

export function createNoteGenerationRouter(generationJobs: NoteGenerationJobs) {
  const router = Router();

  router.post('/', async (request, response) => {
    const result = await generationJobs.submit(request.body);

    if (!result.success) {
      response.status(400).json({ error: 'invalid URL note input' });
      return;
    }

    response.location(`/note-generations/${result.job.id}/events`)
      .status(202)
      .json({ job: result.job });
  });

  router.get('/', async (_request, response) => {
    response.status(200).json({ jobs: await generationJobs.list() });
  });

  router.get('/:id', async (request, response) => {
    const id = jobIdSchema.safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ error: 'invalid generation job id' });
      return;
    }

    const job = await generationJobs.get(id.data);
    if (!job) {
      response.status(404).json({ error: 'generation job not found' });
      return;
    }

    response.status(200).json({ job });
  });

  router.get('/:id/events', (request, response, next) => {
    const id = jobIdSchema.safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ error: 'invalid generation job id' });
      return;
    }

    return createNoteGenerationEventsHandler(generationJobs)(request, response, next);
  });

  return router;
}