import { createServer } from 'node:http';
import { readConfig } from './config/env.js';
import { createApp } from './app.js';
import { writeLog } from './shared/logger.js';

let config;
try {
  config = readConfig();
} catch (error) {
  // readConfig constructs this message using field names only.
  writeLog('error', 'invalid_configuration', { message: error.message });
  process.exit(1);
}

const server = createServer(createApp({ config }));
server.requestTimeout = 60000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;

server.on('error', () => {
  writeLog('error', 'server_failed');
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  writeLog('info', 'server_started', { host: config.host, port: config.port });
});

let stopping = false;
function shutdown(exitCode) {
  if (stopping) return;
  stopping = true;
  writeLog('info', 'server_stopping');
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10000);
  deadline.unref();
  server.close(() => {
    clearTimeout(deadline);
    process.exit(exitCode);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', () => {
  writeLog('error', 'uncaught_exception');
  shutdown(1);
});
process.on('unhandledRejection', () => {
  writeLog('error', 'unhandled_rejection');
  shutdown(1);
});
