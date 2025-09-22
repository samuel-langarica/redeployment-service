import { exec } from 'node:child_process';
import { promisify } from 'util';
import { RepositoryInfo } from '../types';

const execAsync = promisify(exec);

export class GitManager {
  private appsDir: string;

  constructor(appsDir: string) {
    this.appsDir = appsDir;
  }

  /**
   * Get all repositories in the apps directory
   */
  async getRepositories(): Promise<RepositoryInfo[]> {
    const repositories: RepositoryInfo[] = [];
    
    try {
      const { stdout } = await execAsync(`ls -la "${this.appsDir}"`);
      const lines = stdout.split('\n').filter(line => line.startsWith('d'));
      
      for (const line of lines) {
        const parts = line.split(/\s+/);
        const folderName = parts[parts.length - 1];
        
        // Skip hidden directories and the redeployment-service itself
        if (folderName.startsWith('.') || folderName === 'redeployment-service') {
          continue;
        }
        
        const repoPath = `${this.appsDir}/${folderName}`;
        const repoInfo = await this.getRepositoryInfo(folderName, repoPath);
        
        if (repoInfo) {
          repositories.push(repoInfo);
        }
      }
    } catch (error) {
      console.error('Error scanning repositories:', error);
    }
    
    return repositories;
  }

  /**
   * Get information about a specific repository
   */
  private async getRepositoryInfo(name: string, path: string): Promise<RepositoryInfo | null> {
    try {
      // Check if it's a git repository
      const { stdout: isGitRepo } = await execAsync(`cd "${path}" && git rev-parse --is-inside-work-tree 2>/dev/null || echo "false"`);
      
      if (isGitRepo.trim() !== 'true') {
        return null;
      }

      // Get current branch
      const { stdout: currentBranch } = await execAsync(`cd "${path}" && git branch --show-current`);
      
      // Check if docker-compose.yml exists
      const { stdout: hasDockerCompose } = await execAsync(`cd "${path}" && test -f docker-compose.yml && echo "true" || echo "false"`);
      
      return {
        name,
        path,
        currentBranch: currentBranch.trim(),
        hasDockerCompose: hasDockerCompose.trim() === 'true'
      };
    } catch (error) {
      console.error(`Error getting info for repository ${name}:`, error);
      return null;
    }
  }

  /**
   * Pull latest changes for a repository
   */
  async pullLatestChanges(repoPath: string, branch: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`Pulling latest changes for ${repoPath} on branch ${branch}`);
      
      const { stdout, stderr } = await execAsync(`cd "${repoPath}" && git pull origin ${branch}`);
      
      return {
        success: true,
        message: `Successfully pulled changes: ${stdout.trim()}`
      };
    } catch (error: any) {
      const errorMessage = error.stderr || error.message || 'Unknown error';
      console.error(`Error pulling changes for ${repoPath}:`, errorMessage);
      
      return {
        success: false,
        message: `Failed to pull changes: ${errorMessage}`
      };
    }
  }

  /**
   * Get repository name from remote URL
   */
  async getRepositoryName(repoPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`cd "${repoPath}" && git remote get-url origin`);
      const url = stdout.trim();
      
      // Extract repository name from URL
      // Handles both SSH (git@github.com:user/repo.git) and HTTPS (https://github.com/user/repo.git)
      const match = url.match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/);
      
      if (match) {
        return match[2]; // Return just the repository name
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting repository name for ${repoPath}:`, error);
      return null;
    }
  }
}
