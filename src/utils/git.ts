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
      console.log(`🔍 Scanning directory: ${this.appsDir}`);
      
      const { stdout } = await execAsync(`ls -la "${this.appsDir}"`);
      console.log(`📁 Directory listing:`, stdout);
      
      const lines = stdout.split('\n').filter(line => line.startsWith('d'));
      console.log(`📂 Found ${lines.length} directories:`, lines);
      
      for (const line of lines) {
        const parts = line.split(/\s+/);
        const folderName = parts[parts.length - 1];
        
        console.log(`🔍 Processing folder: ${folderName}`);
        
        // Skip hidden directories and the redeployment-service itself
        if (folderName.startsWith('.') || folderName === 'redeployment-service') {
          console.log(`⏭️  Skipping ${folderName} (hidden or redeployment-service)`);
          continue;
        }
        
        const repoPath = `${this.appsDir}/${folderName}`;
        console.log(`📂 Checking repository at: ${repoPath}`);
        
        const repoInfo = await this.getRepositoryInfo(folderName, repoPath);
        
        if (repoInfo) {
          console.log(`✅ Found valid repository:`, repoInfo);
          repositories.push(repoInfo);
        } else {
          console.log(`❌ Invalid repository: ${folderName}`);
        }
      }
      
      console.log(`📊 Total repositories found: ${repositories.length}`);
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
      console.log(`🔍 Checking if ${name} is a git repository...`);
      
      // Check if it's a git repository - try multiple methods
      let isGitRepo = false;
      
      try {
        // Method 1: Check if .git directory exists
        const { stdout: gitDirCheck } = await execAsync(`test -d "${path}/.git" && echo "true" || echo "false"`);
        if (gitDirCheck.trim() === 'true') {
          isGitRepo = true;
          console.log(`📋 ${name} has .git directory`);
        } else {
          // Method 2: Try git rev-parse
          const { stdout: revParseCheck } = await execAsync(`cd "${path}" && git rev-parse --is-inside-work-tree 2>/dev/null || echo "false"`);
          isGitRepo = revParseCheck.trim() === 'true';
          console.log(`📋 Git rev-parse result for ${name}: ${revParseCheck.trim()}`);
        }
      } catch (error) {
        console.log(`📋 Error checking git status for ${name}:`, error);
        isGitRepo = false;
      }
      
      if (!isGitRepo) {
        console.log(`❌ ${name} is not a git repository`);
        return null;
      }

      console.log(`✅ ${name} is a git repository, getting branch...`);
      
      // Get current branch
      const { stdout: currentBranch } = await execAsync(`cd "${path}" && git branch --show-current`);
      console.log(`🌿 Current branch for ${name}: ${currentBranch.trim()}`);
      
      // Check if docker-compose.yml exists
      const { stdout: hasDockerCompose } = await execAsync(`cd "${path}" && test -f docker-compose.yml && echo "true" || echo "false"`);
      console.log(`🐳 Docker compose check for ${name}: ${hasDockerCompose.trim()}`);
      
      const repoInfo = {
        name,
        path,
        currentBranch: currentBranch.trim(),
        hasDockerCompose: hasDockerCompose.trim() === 'true'
      };
      
      console.log(`📊 Repository info for ${name}:`, repoInfo);
      
      return repoInfo;
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
