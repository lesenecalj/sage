import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

import { createApp } from './app.js';
import { createPrismaNotesRepository } from './notes/notes.repository.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const port = Number(process.env.PORT ?? 3000);
const prisma = new PrismaClient();
const app = createApp({ notesRepository: createPrismaNotesRepository(prisma) });
let isShuttingDown = false;

async function startServer() {
	await prisma.$connect();

	const server = app.listen(port, () => {
		console.info(`SAGE API listening on http://localhost:${port}`);
	});

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

			await prisma.$disconnect();
		});
	}

	process.once('SIGINT', () => void shutdown('SIGINT'));
	process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void startServer().catch(async (error: unknown) => {
	console.error('Unable to connect to PostgreSQL.', error);
	await prisma.$disconnect();
	process.exitCode = 1;
});
