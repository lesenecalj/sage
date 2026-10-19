import type { RequestHandler, Response } from 'express';

import type { NoteGenerationJob } from '@sage/contracts';
import type { NoteGenerationEvent, NoteGenerationJobs } from './note-generation-jobs.port.js';

export function createNoteGenerationEventsHandler(
  generationJobs: NoteGenerationJobs,
): RequestHandler<{ id: string }> {
  return (request, response) => createNoteGenerationEventStream(
    generationJobs,
    request.params.id,
    response,
  ).start();
}

/**
 * SSE flow for one generation job:
 * 1. Subscribe before reading the initial snapshot and buffer incoming events.
 * 2. Return 404 if the job is missing; otherwise open the stream and send its snapshot.
 * 3. Process buffered and future events in order, refreshing the snapshot when state changes.
 * 4. Keep the connection alive and release resources on disconnect, error, or terminal state.
 */
function createNoteGenerationEventStream(
  generationJobs: NoteGenerationJobs,
  jobId: string,
  response: Response,
): { start: () => Promise<void> } {
  let closed = false;
  let started = false;
  let processing = false;
  const pendingEvents: NoteGenerationEvent[] = [];
  let currentJob: NoteGenerationJob | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let unsubscribe = () => {};

  /** Starts the subscription and SSE response, then drains events buffered during setup. */
  async function start(): Promise<void> {
    unsubscribe = generationJobs.subscribe(jobId, (event) => {
      if (closed) return;
      pendingEvents.push(event);
      void processEvents();
    });
    response.once('close', close);

    try {
      const initialJob = await generationJobs.get(jobId);
      if (closed) return;
      if (!initialJob) {
        close();
        response.status(404).json({ error: 'generation job not found' });
        return;
      }

      openEventStream();
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
  }

  /** Idempotently releases the subscription, heartbeat timer, and queued events. */
  function close(): void {
    if (closed) return;
    closed = true;
    pendingEvents.length = 0;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
  }

  /** Applies queued notifications serially, refreshing the job snapshot for state changes. */
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
          const snapshot = await generationJobs.get(jobId);
          if (closed) return;
          if (!snapshot) {
            sendError('generation job not found');
            return;
          }
          currentJob = snapshot;
        }

        if (currentJob) await writeJob(currentJob);
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

  /** Sends a retry-aware SSE error and ends this session without exposing internal errors. */
  function sendError(message: string, retryable = false): void {
    if (closed) return;
    if (!response.headersSent) openEventStream();

    response.write(`retry: 1500\nevent: error\ndata: ${JSON.stringify({ error: message, retryable })}\n\n`);
    close();
    response.end();
  }

  /** Writes a job snapshot and ends the stream when the job reaches a terminal state. */
  async function writeJob(job: NoteGenerationJob): Promise<void> {
    if (closed) return;
    if (!response.write(`event: job\ndata: ${JSON.stringify({ job })}\n\n`)) {
      await waitForDrain();
    }
    if (closed) return;
    if (job.status === 'completed' || job.status === 'failed') {
      close();
      response.end();
    }
  }

  /** Waits for response backpressure to clear or for the client to disconnect. */
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

  /** Sets and flushes the headers required to begin an SSE response. */
  function openEventStream(): void {
    response.status(200);
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
  }

  return { start };
}