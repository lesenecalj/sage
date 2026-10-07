import type { RequestHandler } from 'express';

import type { NoteGenerationJob } from '@sage/contracts';
import type { NoteGenerationJobs } from './note-generation-jobs.port.js';

export function createNoteGenerationEventsHandler(
  generationJobs: NoteGenerationJobs,
): RequestHandler<{ id: string }> {
  return async (request, response, next) => {
    let closed = false;
    let started = false;
    let refreshPending = false;
    let refreshing = false;
    let heartbeat: NodeJS.Timeout | undefined;
    let unsubscribe = () => {};

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    };

    const writeJob = (job: NoteGenerationJob) => {
      if (closed) return;
      response.write(`event: job\ndata: ${JSON.stringify({ job })}\n\n`);
      if (job.status === 'completed' || job.status === 'failed') {
        cleanup();
        response.end();
      }
    };

    const sendError = (message: string) => {
      if (closed) return;
      if (!response.headersSent) {
        next(new Error(message));
        return;
      }

      response.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
      cleanup();
      response.end();
    };

    const refresh = async () => {
      if (closed || !started || refreshing) {
        refreshPending = true;
        return;
      }

      refreshing = true;
      try {
        do {
          refreshPending = false;
          const job = await generationJobs.get(request.params.id);
          if (closed) break;
          if (!job) {
            sendError('generation job not found');
            break;
          }
          writeJob(job);
        } while (refreshPending && !closed);
      } catch (error) {
        sendError(error instanceof Error ? error.message : 'Unable to read generation job.');
      } finally {
        refreshing = false;
      }
    };

    unsubscribe = generationJobs.subscribe(request.params.id, () => {
      refreshPending = true;
      void refresh();
    });
    response.once('close', cleanup);

    try {
      const initialJob = await generationJobs.get(request.params.id);
      if (closed) return;
      if (!initialJob) {
        cleanup();
        response.status(404).json({ error: 'generation job not found' });
        return;
      }

      response.status(200);
      response.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.flushHeaders();
      started = true;
      writeJob(initialJob);

      if (!closed) {
        heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 15_000);
        if (refreshPending) void refresh();
      }
    } catch (error) {
      const clientDisconnected = closed;
      cleanup();
      if (!clientDisconnected) next(error);
    }
  };
}