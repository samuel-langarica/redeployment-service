import express from 'express';
import { WebhookRoutes } from './routes/webhook';

// Load environment variables
const PORT = process.env.PORT || 3000;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const APPS_DIR = process.env.APPS_DIR || '/apps';

// Validate required environment variables
if (!GITHUB_WEBHOOK_SECRET) {
  console.error('❌ GITHUB_WEBHOOK_SECRET environment variable is required');
  process.exit(1);
}

// Create Express app
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' })); // GitHub webhooks can be large
app.use(express.urlencoded({ extended: true }));

// Initialize routes
const webhookRoutes = new WebhookRoutes(GITHUB_WEBHOOK_SECRET, APPS_DIR);

// Routes
app.post('/github-webhook', (req, res) => {
  webhookRoutes.handleGitHubWebhook(req, res);
});

app.get('/github-webhook/health', (req, res) => {
  webhookRoutes.healthCheck(req, res);
});

app.get('/github-webhook/repositories', (req, res) => {
  webhookRoutes.getRepositoriesStatus(req, res);
});

// Health endpoint for Traefik routing (after strip prefix)
app.get('/health', (req, res) => {
  webhookRoutes.healthCheck(req, res);
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Redeployment Service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      webhook: 'http://5.78.108.80:3000/github-webhook',
      health: 'http://5.78.108.80:3000/health',
      repositories: 'http://5.78.108.80:3000/github-webhook/repositories'
    }
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Redeployment Service started on port ${PORT}`);
  console.log(`📁 Monitoring apps directory: ${APPS_DIR}`);
  console.log(`🔗 Webhook endpoint: http://5.78.108.80:3000/github-webhook`);
  console.log(`❤️  Health check: http://5.78.108.80:3000/health`);
  console.log(`📊 Repositories status: http://5.78.108.80:3000/github-webhook/repositories`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});
