import type { RequestHandler } from 'express';

import type { NoteGenerationJob } from '@sage/contracts';
import type { NoteGenerationEvent, NoteGenerationJobs } from './note-generation-jobs.port.js';

export function createNoteGenerationEventsHandler(
  generationJobs: NoteGenerationJobs,
): RequestHandler<{ id: string }> {
  return async (request, response, next) => {
    let closed = false;
    let started = false;
    const pendingEvents: NoteGenerationEvent[] = [];
    let processing = false;
    let currentJob: NoteGenerationJob | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    let unsubscribe = () => {};

    const cleanup = () => {
      if (closed) return;
      closed = true;
      pendingEvents.length = 0;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    };

    const waitForDrain = () => new Promise<void>((resolve) => {
      const finish = () => {
        response.off('drain', finish);
        response.off('close', finish);
        resolve();
      };
      response.once('drain', finish);
      response.once('close', finish);
    });

    const writeJob = async (job: NoteGenerationJob) => {
      if (closed) return;
      if (!response.write(`event: job\ndata: ${JSON.stringify({ job })}\n\n`)) {
        await waitForDrain();
      }
      if (closed) return;
      if (job.status === 'completed' || job.status === 'failed') {
        cleanup();
        response.end();
      }
    };

    const sendError = (message: string, retryable = false) => {
      if (closed) return;
      if (!response.headersSent) {
        response.status(200);
        response.set({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        response.flushHeaders();
      }

      response.write(`retry: 1500\nevent: error\ndata: ${JSON.stringify({ error: message, retryable })}\n\n`);
      cleanup();
      response.end();
    };

    const processEvents = async () => {
      if (closed || !started || processing) return;
      processing = true;
      try {
        while (pendingEvents.length && !closed) {
          const event = pendingEvents.shift();
          if (!event || !currentJob) continue;
          if (event.type === 'tracking_error') {
            sendError('Generation tracking is temporarily unavailable. Reconnecting...', true);
            return;
          } else if (event.type === 'progress') {
            currentJob = { ...currentJob, status: 'running', stage: event.stage, error: null, finishedAt: null };
          } else {
            const snapshot = await generationJobs.get(request.params.id);
            if (closed) return;
            if (!snapshot) {
              sendError('generation job not found');
              return;
            }
            currentJob = snapshot;
          }
          await writeJob(currentJob);
        }
      } catch (error) {
        if (!closed) {
          console.error('Unable to refresh generation tracking.', error);
          sendError('Generation tracking is temporarily unavailable. Reconnecting...', true);
        }
      } finally {
        processing = false;
      }
    };

    unsubscribe = generationJobs.subscribe(request.params.id, (event) => {
      if (closed) return;
      pendingEvents.push(event);
      void processEvents();
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
      currentJob = initialJob;
      await writeJob(initialJob);
      started = true;

      if (!closed) {
        heartbeat = setInterval(() => {
          if (!closed && !response.writableNeedDrain) response.write(': keep-alive\n\n');
        }, 15_000);
        void processEvents();
      }
    } catch (error) {
      if (!closed) {
        console.error('Unable to load generation tracking.', error);
        sendError('Generation tracking is temporarily unavailable. Reconnecting...', true);
      }
    }
  };
}