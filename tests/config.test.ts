import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('config reads GEMINI_API_KEY from .env without any other setup', () => {
  // Regression: .env used to be loaded in server.ts after its imports ran,
  // so config saw an empty environment and the app fell back to demo mode.
  const dir = mkdtempSync(join(tmpdir(), 'teolima-env-'));
  const envFile = join(dir, '.env');
  writeFileSync(envFile, 'GEMINI_API_KEY=test-key-123\nMAX_CONNECTIONS=7\n');

  const env: NodeJS.ProcessEnv = { ...process.env, DOTENV_CONFIG_PATH: envFile };
  delete env.GEMINI_API_KEY;
  delete env.MAX_CONNECTIONS;

  const out = execFileSync(
    process.execPath,
    ['--import', 'tsx', '-e', "import('./server/config.ts').then((m) => process.stdout.write(JSON.stringify({ key: m.config.geminiApiKey, max: m.config.maxConnections })))"],
    { env, encoding: 'utf8' },
  );
  assert.deepEqual(JSON.parse(out.trim().split('\n').pop() as string), { key: 'test-key-123', max: 7 });
});
