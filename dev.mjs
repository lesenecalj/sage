import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const envFile = join(root, 'apps/api/.env');
const requireFromApi = createRequire(new URL('./apps/api/package.json', import.meta.url));
const { config } = requireFromApi('dotenv');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args) {
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function ensureOllamaModel(model) {
  const result = spawnSync('docker', [
    'compose', 'exec', '-T', 'ollama', 'ollama', 'show', model,
  ], {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    run('docker', ['compose', 'exec', '-T', 'ollama', 'ollama', 'pull', model]);
  }
}

try {
  if (!existsSync(envFile)) {
    copyFileSync(join(root, 'apps/api/.env.example'), envFile);
    console.info('Created apps/api/.env from apps/api/.env.example.');
  }
  config({ path: envFile });

  run('docker', ['compose', 'up', '--detach', '--wait', 'postgres', 'ollama', 'redis']);
  ensureOllamaModel(process.env.OLLAMA_MODEL ?? 'llama3.2');
  run(npm, ['run', 'db:generate', '--workspace', '@sage/api']);
  run(npm, ['run', 'db:deploy', '--workspace', '@sage/api']);
  run(npm, ['run', 'build', '--workspace', '@sage/contracts']);
  run(npm, ['run', 'dev:watch']);
} catch (error) {
  console.error(`Unable to start SAGE: ${error.message}`);
  process.exitCode = error.status ?? 1;
}