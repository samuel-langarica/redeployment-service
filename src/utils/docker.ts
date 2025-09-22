import { exec } from 'node:child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DockerManager {
  /**
   * Deploy a repository using Docker Compose
   */
  async deployRepository(repoPath: string, repoName: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`Starting deployment for ${repoName} in ${repoPath}`);
      
      // First, stop and remove containers
      console.log(`Stopping containers for ${repoName}...`);
      const { stdout: downOutput, stderr: downError } = await execAsync(
        `cd "${repoPath}" && docker compose down`,
        { timeout: 60000 } // 60 second timeout
      );
      
      if (downError && !downError.includes('No containers to stop')) {
        console.warn(`Warning during docker compose down for ${repoName}:`, downError);
      }
      
      // Then build and start containers
      console.log(`Building and starting containers for ${repoName}...`);
      const { stdout: upOutput, stderr: upError } = await execAsync(
        `cd "${repoPath}" && docker compose up --build -d`,
        { timeout: 300000 } // 5 minute timeout for build
      );
      
      if (upError) {
        console.error(`Error during docker compose up for ${repoName}:`, upError);
        return {
          success: false,
          message: `Docker Compose error: ${upError}`
        };
      }
      
      console.log(`Successfully deployed ${repoName}`);
      return {
        success: true,
        message: `Successfully deployed ${repoName}. Output: ${upOutput.trim()}`
      };
      
    } catch (error: any) {
      const errorMessage = error.stderr || error.message || 'Unknown error';
      console.error(`Error deploying ${repoName}:`, errorMessage);
      
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
}
