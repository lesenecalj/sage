import { fileURLToPath } from 'node:url';

import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

import { summarizeWithOllama } from '../ai/ollama-note-summarizer.js';
import { createPrismaNotesRepository } from '../notes/notes.repository.js';
import { noteGenerationQueueName, redisConnectionOptions, type NoteGenerationJobResult } from './note-generation.queue.js';
import { createNotesService } from '../notes/notes.service.js';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const prisma = new PrismaClient();
let worker: Worker<unknown, NoteGenerationJobResult, string> | undefined;
let isShuttingDown = false;
let prismaConnection: Promise<void> | undefined;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.info(`Generation worker received ${signal}; waiting for active jobs.`);
  await prismaConnection?.catch(() => {});
  try {
    await worker?.close();
  } finally {
    await prisma.$disconnect();
  }
}

process.once('SIGINT', () => {
  void shutdown('SIGINT').catch((error: unknown) => {
    console.error('Unable to shut down note generation worker.', error);
    process.exitCode = 1;
  });
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM').catch((error: unknown) => {
    console.error('Unable to shut down note generation worker.', error);
    process.exitCode = 1;
  });
});

async function startWorker() {
  prismaConnection = prisma.$connect();
  await prismaConnection;
  if (isShuttingDown) return;

  const notesService = createNotesService(createPrismaNotesRepository(prisma), {
    summarize: summarizeWithOllama,
  });
  worker = new Worker<unknown, NoteGenerationJobResult, string>(
    noteGenerationQueueName,
    async (job) => {
      if (!job.id) throw new Error('Generation job ID is missing.');
      const note = await notesService.processGenerationJob({
        id: job.id,
        input: job.data,
        reportProgress: (stage) => job.updateProgress({ stage }),
      });
      return { noteId: note.id };
    },
    { connection: redisConnectionOptions(), concurrency: 1 },
  );
  worker.on('failed', (job, error) => {
    console.error(`Note generation job ${job?.id ?? 'unknown'} failed.`, error);
  });
  worker.on('error', (error) => console.error('Note generation worker error.', error));
  await worker.waitUntilReady();
  if (isShuttingDown) return;
  console.info('Note generation worker is ready.');
}

void startWorker().catch(async (error: unknown) => {
  if (isShuttingDown) return;
  console.error('Unable to start note generation worker.', error);
  try {
    await worker?.close();
  } catch (closeError) {
    console.error('Unable to close note generation worker after startup failure.', closeError);
  }
  try {
    await prisma.$disconnect();
  } catch (disconnectError) {
    console.error('Unable to disconnect Prisma after worker startup failure.', disconnectError);
  }
  process.exitCode = 1;
});