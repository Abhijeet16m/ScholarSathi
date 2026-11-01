// Keep the repository-root Vercel entry point on the same authenticated
// frontend server used by local development and frontend-root deployments.
import app from './frontend/server.js';

export default app;
