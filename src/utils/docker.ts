import { exec } from 'node:child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DockerManager {
  /**
   * Deploy a repository using Docker Compose
   */
  async deployRepository(repoPath: string, repoName: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🐳 Deploy ${repoName} @ ${repoPath}`);
      
      // First, stop and remove containers
      console.log(`docker compose down → ${repoName}`);
      const { stdout: downOutput, stderr: downError } = await execAsync(
        `cd "${repoPath}" && docker compose down`,
        { timeout: 60000 } // 60 second timeout
      );
      
      if (downError && !downError.includes('No containers to stop')) {
        console.warn(`down warning ${repoName}:`, downError);
      }
      
      // Clean up any orphaned containers and networks
      console.log(`docker compose down --remove-orphans → ${repoName}`);
      await execAsync(
        `cd "${repoPath}" && docker compose down --remove-orphans`,
        { timeout: 30000 }
      ).catch(() => {}); // Ignore errors for cleanup
      
      // Build with no cache first, then start containers
      console.log(`docker compose build --no-cache → ${repoName}`);
      const { stdout: buildOutput, stderr: buildError } = await execAsync(
        `cd "${repoPath}" && docker compose build --no-cache`,
        { timeout: 300000 } // 5 minute timeout for build
      );
      
      if (buildError && (buildError.includes('ERROR') || buildError.includes('error') || buildError.includes('failed'))) {
        console.error(`build error ${repoName}:`, buildError);
        return {
          success: false,
          message: `Docker Compose build error: ${buildError}`
        };
      }
      
      // Then start containers with force recreate
      console.log(`docker compose up --force-recreate -d → ${repoName}`);
      const { stdout: upOutput, stderr: upError } = await execAsync(
        `cd "${repoPath}" && docker compose up --force-recreate -d`,
        { timeout: 60000 } // 1 minute timeout for start
      );
      
      // Docker Compose writes progress to stderr even on success, so we need to check for actual errors
      if (upError && (upError.includes('ERROR') || upError.includes('error') || upError.includes('failed'))) {
        console.error(`up error ${repoName}:`, upError);
        return {
          success: false,
          message: `Docker Compose error: ${upError}`
        };
      }
      
      console.log(`✅ Deployed ${repoName}`);
      return {
        success: true,
        message: `Successfully deployed ${repoName}. Build: ${buildOutput.trim()}, Start: ${upOutput.trim()}`
      };
      
    } catch (error: any) {
      const errorMessage = error.stderr || error.message || 'Unknown error';
      console.error(`deploy error ${repoName}:`, errorMessage);
      
      return {
        success: false,
        message: `Deployment failed: ${errorMessage}`
      };
    }
  }

  /**
   * Check if Docker is available
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker --version');
      return true;
    } catch (error) {
      console.error('Docker is not available:', error);
      return false;
    }
  }

  /**
   * Check if Docker Compose is available
   */
  async isDockerComposeAvailable(): Promise<boolean> {
    try {
      await execAsync('docker compose version');
      return true;
    } catch (error) {
      console.error('Docker Compose is not available:', error);
      return false;
    }
  }

  /**
   * Check container logs for debugging
   */
  async getContainerLogs(repoPath: string, repoName: string, lines: number = 50): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `cd "${repoPath}" && docker compose logs --tail=${lines}`,
        { timeout: 10000 }
      );
      return stdout;
    } catch (error: any) {
      return `Error getting logs: ${error.message}`;
    }
  }

  /**
   * Check if containers are running
   */
  async getContainerStatus(repoPath: string, repoName: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `cd "${repoPath}" && docker compose ps`,
        { timeout: 10000 }
      );
      return stdout;
    } catch (error: any) {
      return `Error getting status: ${error.message}`;
    }
  }
}