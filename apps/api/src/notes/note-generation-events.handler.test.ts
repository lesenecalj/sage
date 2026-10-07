import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { NoteGenerationJob } from '@sage/contracts';
import type { NoteGenerationJobs } from './note-generation-jobs.port.js';
import { createNoteGenerationEventsHandler } from './note-generation-events.handler.js';

const job: NoteGenerationJob = {
  id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45',
  status: 'queued',
  stage: 'queued',
  noteId: null,
  error: null,
  createdAt: '2026-09-27T12:00:00.000Z',
  finishedAt: null,
};

describe('note generation events handler', () => {
  it('does not write the initial snapshot if the client disconnects while it loads', async () => {
    let resolveSnapshot: (snapshot: NoteGenerationJob | null) => void = () => {};
    const get = vi.fn(() => new Promise<NoteGenerationJob | null>((resolve) => {
      resolveSnapshot = resolve;
    }));
    const unsubscribe = vi.fn();
    const jobs: NoteGenerationJobs = {
      waitUntilReady: async () => {},
      close: async () => {},
      submit: async () => ({ success: false, error: 'INVALID_INPUT' }),
      get,
      list: async () => [],
      subscribe: () => unsubscribe,
    };

    const emitter = new EventEmitter();
    const response = Object.assign(emitter, {
      status: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    });
    const next = vi.fn();
    const handler = createNoteGenerationEventsHandler(jobs) as unknown as (
      request: Request<{ id: string }>,
      response: Response,
      next: NextFunction,
    ) => Promise<void>;

    const handling = handler(
      { params: { id: job.id } } as Request<{ id: string }>,
      response as unknown as Response,
      next,
    );
    expect(get).toHaveBeenCalledWith(job.id);

    emitter.emit('close');
    resolveSnapshot(job);
    await handling;

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(response.set).not.toHaveBeenCalled();
    expect(response.write).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});