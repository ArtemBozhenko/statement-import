import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Starts the real mock from the kit in a child process and returns its base URL.
 * Every call gets a fresh server with its own temporary state file, so the counters
 * in tests are deterministic and independent of a mock the developer may have running.
 */
export interface RunningMock {
  baseUrl: string;
  stop(): Promise<void>;
}

export async function startMockServer(): Promise<RunningMock> {
  const directory = mkdtempSync(join(tmpdir(), 'statement-import-mock-'));
  const statePath = join(directory, 'state.json');
  const launcher = join(__dirname, 'mock-launcher.mjs');
  const child: ChildProcess = spawn(process.execPath, [launcher, statePath], { stdio: ['pipe', 'pipe', 'inherit'] });

  const port = await new Promise<number>((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const match = buffer.match(/PORT (\d+)/);
      if (match) {
        child.stdout?.off('data', onData);
        resolve(Number(match[1]));
      }
    };
    child.stdout?.on('data', onData);
    child.once('exit', (code) => reject(new Error(`mock exited early with code ${code}`)));
    child.once('error', reject);
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve) => {
        child.once('exit', () => {
          rmSync(directory, { recursive: true, force: true });
          resolve();
        });
        child.kill('SIGTERM');
      }),
  };
}
