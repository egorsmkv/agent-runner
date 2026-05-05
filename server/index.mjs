import { createServer } from 'node:http';

import { createApp } from './app.mjs';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const server = createServer(createApp());
const isEntrypoint =
  process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href;

if (isEntrypoint) {
  server.listen(port, () => {
    process.stdout.write(`RSS feed API listening on http://localhost:${port}\n`);
  });
}

export { server };
