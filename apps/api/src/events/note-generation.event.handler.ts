import type { RequestHandler } from 'express';

import type { NoteGenerationJob } from '@sage/contracts';
import type { NoteGenerationEvent, NoteGenerationJobs } from '../workers/types.js';

export function createNoteGenerationEventsHandler(
  jobs: Pick<NoteGenerationJobs, 'get' | 'subscribe'>,
): RequestHandler<{ id: string }> {
  return async (request, response) => {
    const jobId = request.params.id;
    let closed = false;
    let opened = false;
    let started = false;
    let processing = false;
    let currentJob: NoteGenerationJob | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    let unsubscribe = () => {};
    const pendingEvents: NoteGenerationEvent[] = [];

    function close(): void {
      if (closed) return;
      closed = true;
      pendingEvents.length = 0;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
      response.off('close', close);
    }

    function sendError(message: string, retryable = false): void {
      if (closed) return;
      openEventStream();
      response.write(`retry: 1500\nevent: error\ndata: ${JSON.stringify({ error: message, retryable })}\n\n`);
      close();
      response.end();
    }

    async function writeJob(job: NoteGenerationJob): Promise<void> {
      if (closed) return;
      openEventStream();
      if (!response.write(`event: job\ndata: ${JSON.stringify({ job })}\n\n`)) {
        await waitForDrain();
      }
      if (closed) return;
      if (job.status === 'completed' || job.status === 'failed') {
        close();
        response.end();
      }
    }

    async function processEvents(): Promise<void> {
      if (closed || !started || processing) return;
      processing = true;
      try {
        while (pendingEvents.length && !closed) {
          const event = pendingEvents.shift();
          const previousJob = currentJob;
          if (!event || !previousJob) continue;

          if (event.type === 'tracking_error') {
            sendError('Generation tracking is temporarily unavailable. Reconnecting...', true);
            return;
          }
          if (event.type === 'progress') {
            currentJob = { ...previousJob, status: 'running', stage: event.stage, error: null, finishedAt: null };
          } else {
            const snapshot = await jobs.get(jobId);
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
    }

    function waitForDrain(): Promise<void> {
      return new Promise((resolve) => {
        const finish = () => {
          response.off('drain', finish);
          response.off('close', finish);
          resolve();
        };
        response.once('drain', finish);
        response.once('close', finish);
      });
    }

    function openEventStream(): void {
      if (opened) return;
      opened = true;
      response.status(200);
      response.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.flushHeaders();
      heartbeat = setInterval(() => {
        if (!closed && !response.writableNeedDrain) response.write(': keep-alive\n\n');
      }, 15_000);
    }

    response.once('close', close);
    try {
      unsubscribe = jobs.subscribe(jobId, (event) => {
        if (closed) return;
        pendingEvents.push(event);
        void processEvents();
      });
      const initialJob = await jobs.get(jobId);
      if (closed) return;
      if (!initialJob) {
        close();
        response.status(404).json({ error: 'generation job not found' });
        return;
      }
      currentJob = initialJob;
      await writeJob(initialJob);
      started = true;
      void processEvents();
    } catch (error) {
      if (!closed) {
        console.error('Unable to load generation tracking.', error);
        sendError('Generation tracking is temporarily unavailable. Reconnecting...', true);
      }
    }
  };
}