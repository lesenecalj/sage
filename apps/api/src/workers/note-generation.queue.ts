import { Queue, type ConnectionOptions } from 'bullmq';

import type { FromUrlInput } from '../notes/from-url.input.js';

export const noteGenerationQueueName = 'note-generation';
export type NoteGenerationJobResult = { noteId: string };

export function redisConnectionOptions(redisUrl = process.env.REDIS_URL): ConnectionOptions {
  if (!redisUrl) throw new Error('REDIS_URL is required.');

  const url = new URL(redisUrl);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use the redis:// or rediss:// protocol.');
  }

  const database = url.pathname.slice(1);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(database ? { db: Number(database) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export function createNoteGenerationQueue(redisUrl?: string) {
  return new Queue<FromUrlInput, NoteGenerationJobResult, string>(noteGenerationQueueName, {
    connection: redisConnectionOptions(redisUrl),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 500 },
      removeOnFail: { age: 30 * 24 * 60 * 60, count: 1_000 },
    },
  });
}