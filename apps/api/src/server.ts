import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

import { summarizeWithOllama } from './ai/ollama-note-summarizer.js';
import { createApp } from './app.js';
import { createPrismaNotesRepository } from './notes/notes.repository.js';
import { createNotesService } from './notes/notes.service.js';
import { createRedisNoteGenerationJobs } from './workers/note-generation.jobs.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const port = Number(process.env.PORT ?? 3000);
const host = '127.0.0.1';
const prisma = new PrismaClient();
const notesService = createNotesService(createPrismaNotesRepository(prisma), {
	summarize: summarizeWithOllama,
});
const noteGenerationJobs = createRedisNoteGenerationJobs();
const app = createApp({ notesService, noteGenerationJobs });
let isShuttingDown = false;

function listen(): Promise<Server> {
	return new Promise((resolve, reject) => {
		const server = app.listen(port, host);
		const onListening = () => {
			server.off('error', onError);
			resolve(server);
		};
		const onError = (error: Error) => {
			server.off('listening', onListening);
			reject(error);
		};

		server.once('listening', onListening);
		server.once('error', onError);
	});
}

async function startServer() {
	await prisma.$connect();
	await noteGenerationJobs.waitUntilReady();

	const server = await listen();
	console.info(`SAGE API listening on http://${host}:${port}`);

	async function shutdown(signal: string) {
		if (isShuttingDown) {
			return;
		}

		isShuttingDown = true;
		console.info(`Received ${signal}, shutting down.`);

		server.close(async (error) => {
			if (error) {
				console.error('Unable to close the HTTP server.', error);
				process.exitCode = 1;
			}

			await Promise.all([noteGenerationJobs.close(), prisma.$disconnect()]);
		});
		server.closeAllConnections();
	}

	process.once('SIGINT', () => void shutdown('SIGINT'));
	process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void startServer().catch(async (error: unknown) => {
	console.error('Unable to start SAGE API.', error);
	await Promise.all([noteGenerationJobs.close(), prisma.$disconnect()]);
	process.exitCode = 1;
});
