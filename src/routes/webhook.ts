import { Request, Response } from 'express';
import { WebhookValidator } from '../utils/webhook';
import { DeploymentService } from '../services/deployment';
import { GitHubPushEvent } from '../types';

export class WebhookRoutes {
  private webhookValidator: WebhookValidator;
  private deploymentService: DeploymentService;

  constructor(webhookSecret: string, appsDir: string) {
    this.webhookValidator = new WebhookValidator(webhookSecret);
    this.deploymentService = new DeploymentService(appsDir);
  }

  /**
   * Handle GitHub webhook
   */
  async handleGitHubWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Get the raw body for signature verification
      const payload = JSON.stringify(req.body);
      const signature = req.headers['x-hub-signature-256'] as string;

      // Verify webhook signature
      if (!this.webhookValidator.verifySignature(payload, signature)) {
        console.error('Invalid webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Check if it's a push event
      const eventType = req.headers['x-github-event'] as string;
      if (eventType !== 'push') {
        console.log(`Ignoring event type: ${eventType}`);
        res.status(200).json({ message: 'Event ignored' });
        return;
      }

      const pushEvent: GitHubPushEvent = req.body;
      
      // Log the push event
      console.log(`Received push event for ${pushEvent.repository.name} on ${pushEvent.ref}`);
      console.log(`Commit: ${pushEvent.head_commit.id} by ${pushEvent.pusher.name}`);
      console.log(`Message: ${pushEvent.head_commit.message}`);

      // Process the deployment
      const results = await this.deploymentService.processPushEvent(pushEvent);

      // Log results
      results.forEach(result => {
        if (result.success) {
          console.log(`✅ Successfully deployed ${result.repository}:${result.branch}`);
        } else {
          console.error(`❌ Failed to deploy ${result.repository}:${result.branch} - ${result.message}`);
        }
      });

      // Return response
      res.status(200).json({
        message: 'Webhook processed successfully',
        deployments: results.length,
        results: results
      });

    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const dockerStatus = await this.deploymentService.checkDockerAvailability();
      const repositories = await this.deploymentService.getRepositoriesStatus();
      
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        docker: dockerStatus,
        repositories: {
          total: repositories.length,
          withDockerCompose: repositories.filter(r => r.hasDockerCompose).length
        }
      });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(500).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get repositories status
   */
  async getRepositoriesStatus(req: Request, res: Response): Promise<void> {
    try {
      const repositories = await this.deploymentService.getRepositoriesStatus();
      
      res.status(200).json({
        repositories: repositories,
        total: repositories.length
      });
    } catch (error) {
      console.error('Error getting repositories status:', error);
      res.status(500).json({
        error: 'Failed to get repositories status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
