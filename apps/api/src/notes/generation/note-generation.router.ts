import { Router } from 'express';
import { z } from 'zod';

import { createNoteGenerationEventsHandler } from '../../events/note-generation.event.handler.js';
import type { NoteGenerationJobs } from '../../workers/types.js';

const jobIdSchema = z.string().uuid();

export function createNoteGenerationRouter(
  noteGenerationJobs: NoteGenerationJobs,
) {
  const router = Router();
  const streamEvents = createNoteGenerationEventsHandler(noteGenerationJobs);

  router.post('/', async (request, response) => {
    const result = await noteGenerationJobs.submit(request.body);

    if (!result.success) {
      response.status(400).json({ error: 'invalid URL note input' });
      return;
    }

    response.location(`/note-generations/${result.job.id}/events`)
      .status(202)
      .json({ job: result.job });
  });

  router.get('/', async (_request, response) => {
    response.status(200).json({ jobs: await noteGenerationJobs.list() });
  });

  router.get('/:id', async (request, response) => {
    const id = jobIdSchema.safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ error: 'invalid generation job id' });
      return;
    }

    const job = await noteGenerationJobs.get(id.data);
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

    return streamEvents(request, response, next);
  });

  return router;
}