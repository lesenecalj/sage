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

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.info(`Generation worker received ${signal}; waiting for active jobs.`);
  await worker?.close();
  await prisma.$disconnect();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

async function startWorker() {
  await prisma.$connect();
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
  console.info('Note generation worker is ready.');
}

void startWorker().catch(async (error: unknown) => {
  console.error('Unable to start note generation worker.', error);
  await worker?.close();
  await prisma.$disconnect();
  process.exitCode = 1;
});