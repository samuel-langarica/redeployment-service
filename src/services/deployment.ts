import { GitManager } from '../utils/git';
import { DockerManager } from '../utils/docker';
import { GitHubPushEvent, RepositoryInfo, DeploymentResult } from '../types';

export class DeploymentService {
  private gitManager: GitManager;
  private dockerManager: DockerManager;

  constructor(appsDir: string) {
    this.gitManager = new GitManager(appsDir);
    this.dockerManager = new DockerManager();
  }

  /**
   * Process a GitHub push event and deploy matching repositories
   */
  async processPushEvent(pushEvent: GitHubPushEvent): Promise<DeploymentResult[]> {
    const results: DeploymentResult[] = [];
    
    try {
      // Extract repository name and branch from the push event
      const pushedRepoName = pushEvent.repository.name;
      const pushedBranch = this.extractBranchFromRef(pushEvent.ref);
      
      console.log(`Processing push event for ${pushedRepoName} on branch ${pushedBranch}`);
      
      // Get all repositories in the apps directory
      const repositories = await this.gitManager.getRepositories();
      console.log(`Found ${repositories.length} repositories in apps directory`);
      
      // Find matching repositories
      const matchingRepos = repositories.filter(repo => {
        return repo.name === pushedRepoName && 
               repo.currentBranch === pushedBranch && 
               repo.hasDockerCompose;
      });
      
      console.log(`Found ${matchingRepos.length} matching repositories for deployment`);
      
      if (matchingRepos.length === 0) {
        console.log(`No matching repositories found for ${pushedRepoName}:${pushedBranch}`);
        return results;
      }
      
      // Deploy each matching repository
      for (const repo of matchingRepos) {
        const result = await this.deployRepository(repo, pushedBranch);
        results.push(result);
      }
      
    } catch (error) {
      console.error('Error processing push event:', error);
      results.push({
        repository: 'unknown',
        branch: 'unknown',
        success: false,
        message: `Error processing push event: ${error}`,
        timestamp: new Date().toISOString()
      });
    }
    
    return results;
  }

  /**
   * Deploy a single repository
   */
  private async deployRepository(repo: RepositoryInfo, branch: string): Promise<DeploymentResult> {
    const startTime = new Date();
    
    try {
      console.log(`Starting deployment for ${repo.name} on branch ${branch}`);
      
      // Pull latest changes
      const pullResult = await this.gitManager.pullLatestChanges(repo.path, branch);
      
      if (!pullResult.success) {
        return {
          repository: repo.name,
          branch,
          success: false,
          message: `Failed to pull changes: ${pullResult.message}`,
          timestamp: startTime.toISOString()
        };
      }
      
      console.log(`Successfully pulled changes for ${repo.name}: ${pullResult.message}`);
      
      // Deploy with Docker Compose
      const deployResult = await this.dockerManager.deployRepository(repo.path, repo.name);
      
      return {
        repository: repo.name,
        branch,
        success: deployResult.success,
        message: deployResult.message,
        timestamp: startTime.toISOString()
      };
      
    } catch (error) {
      console.error(`Error deploying ${repo.name}:`, error);
      return {
        repository: repo.name,
        branch,
        success: false,
        message: `Deployment error: ${error}`,
        timestamp: startTime.toISOString()
      };
    }
  }

  /**
   * Extract branch name from Git ref
   */
  private extractBranchFromRef(ref: string): string {
    // refs/heads/main -> main
    // refs/heads/develop -> develop
    return ref.replace('refs/heads/', '');
  }

  /**
   * Get status of all repositories
   */
  async getRepositoriesStatus(): Promise<RepositoryInfo[]> {
    return await this.gitManager.getRepositories();
  }

  /**
   * Check if Docker is available
   */
  async checkDockerAvailability(): Promise<{ docker: boolean; compose: boolean }> {
    const docker = await this.dockerManager.isDockerAvailable();
    const compose = await this.dockerManager.isDockerComposeAvailable();
    
    return { docker, compose };
  }
}
