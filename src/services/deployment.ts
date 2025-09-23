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
      
      console.log(`Process push ${pushedRepoName}:${pushedBranch}`);
      
      // Get all repositories in the apps directory
      const repositories = await this.gitManager.getRepositories();
      console.log(`Repos in apps dir: ${repositories.length}`);
      
      // Find matching repositories
      const matchingRepos = repositories.filter(repo => {
        return repo.name === pushedRepoName && 
               repo.currentBranch === pushedBranch && 
               repo.hasDockerCompose;
      });
      
      console.log(`Matching for deploy: ${matchingRepos.length}`);
      
      if (matchingRepos.length === 0) {
        console.log(`No matches for ${pushedRepoName}:${pushedBranch}`);
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
      console.log(`Start deploy ${repo.name}:${branch}`);
      
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
      
      console.log(`Pulled ${repo.name}`);
      
      // Check permissions first
      const permissionCheck = await this.dockerManager.checkPermissions(repo.path, repo.name);
      console.log(`🔐 Permission check:`, permissionCheck);
      
      // Fix common Python package issues before deployment
      const fixResult = await this.dockerManager.fixPythonPackageIssues(repo.path, repo.name);
      if (fixResult !== 'No fixes needed') {
        console.log(`🔧 Applied fixes: ${fixResult}`);
      }
      
      // Deploy with Docker Compose
      const deployResult = await this.dockerManager.deployRepository(repo.path, repo.name);
      
      // If deployment failed, get additional debugging info
      if (!deployResult.success) {
        console.log(`🔍 Getting debug info for failed deployment: ${repo.name}`);
        const logs = await this.dockerManager.getContainerLogs(repo.path, repo.name, 100);
        const status = await this.dockerManager.getContainerStatus(repo.path, repo.name);
        
        console.log(`📋 Container status:`, status);
        console.log(`📋 Recent logs:`, logs);
      }
      
      return {
        repository: repo.name,
        branch,
        success: deployResult.success,
        message: deployResult.message,
        timestamp: startTime.toISOString()
      };
      
    } catch (error) {
      console.error(`Deploy error ${repo.name}:`, error);
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
