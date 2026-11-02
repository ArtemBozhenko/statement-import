// Launcher for the real mock server from the kit, used by the integration tests.
// Jest cannot require() ESM modules, so the server runs as a separate process:
// it imports createMockServer from the untouched kit/, listens on a random loopback port
// with a temporary state file and prints `PORT <n>` once ready.
import { createMockServer } from '../../../kit/mock-server.mjs';

const statePath = process.argv[2];
if (!statePath) {
  console.error('usage: node mock-launcher.mjs <state-path>');
  process.exit(2);
}

const server = createMockServer({ statePath });
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PORT ${server.address().port}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
// The parent died: exit with it so we do not leave an orphan process behind.
process.stdin.on('end', () => server.close(() => process.exit(0)));
process.stdin.resume();
