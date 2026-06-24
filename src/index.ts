// Main entry point when running `node dist/index.js` directly (not via CLI).
// Starts the server using config defaults.
import { startServer } from './server.js';

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
