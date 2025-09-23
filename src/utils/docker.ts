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
      
      // Ensure files are synced to disk before building
      console.log(`Syncing files to disk → ${repoName}`);
      await execAsync(`cd "${repoPath}" && sync`, { timeout: 10000 }).catch(() => {});
      
      // Verify build context before building
      console.log(`Verifying build context → ${repoName}`);
      const { stdout: contextCheck } = await execAsync(`cd "${repoPath}" && ls -la app/ && test -f app/__init__.py && echo "✅ app/__init__.py exists" || echo "❌ app/__init__.py missing"`);
      console.log(`Build context check:`, contextCheck);
      
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
      
      // Wait a moment for containers to fully start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if containers are actually running
      const { stdout: statusOutput } = await execAsync(
        `cd "${repoPath}" && docker compose ps --format "table {{.Name}}\\t{{.Status}}"`,
        { timeout: 10000 }
      );
      
      console.log(`Container status for ${repoName}:`, statusOutput);
      
      // Check if any containers are not running
      if (statusOutput.includes('Exited') || statusOutput.includes('Dead') || statusOutput.includes('Restarting')) {
        console.error(`Container not running properly for ${repoName}`);
        return {
          success: false,
          message: `Container failed to start properly: ${statusOutput}`
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
   * Get detailed container information for debugging
   */
  async getContainerDebugInfo(repoPath: string, repoName: string): Promise<string> {
    try {
      const commands = [
        `cd "${repoPath}" && docker compose ps -a`,
        `cd "${repoPath}" && docker compose config`,
        `cd "${repoPath}" && ls -la`,
        `cd "${repoPath}" && find . -name "*.py" -o -name "app*" -o -name "main*" | head -20`,
        `cd "${repoPath}" && ls -la app/ 2>/dev/null || echo "app directory not found"`,
        `cd "${repoPath}" && ls -la app/main.py 2>/dev/null || echo "app/main.py not found"`,
        `cd "${repoPath}" && ls -la app/__init__.py 2>/dev/null || echo "app/__init__.py not found"`
      ];
      
      let debugInfo = `=== Debug Info for ${repoName} ===\n`;
      
      for (const cmd of commands) {
        try {
          const { stdout } = await execAsync(cmd, { timeout: 5000 });
          debugInfo += `\n--- ${cmd} ---\n${stdout}\n`;
        } catch (error: any) {
          debugInfo += `\n--- ${cmd} ---\nError: ${error.message}\n`;
        }
      }
      
      return debugInfo;
    } catch (error: any) {
      return `Error getting debug info: ${error.message}`;
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

  /**
   * Fix common Python package issues
   */
  async fixPythonPackageIssues(repoPath: string, repoName: string): Promise<string> {
    try {
      const fixes: string[] = [];
      
      // Check if app/__init__.py exists
      try {
        await execAsync(`test -f "${repoPath}/app/__init__.py"`);
        console.log(`✅ app/__init__.py exists`);
      } catch {
        // Create app/__init__.py if it doesn't exist
        await execAsync(`touch "${repoPath}/app/__init__.py"`);
        // Verify it was created
        await execAsync(`test -f "${repoPath}/app/__init__.py"`);
        fixes.push('Created app/__init__.py');
        console.log(`✅ Created and verified app/__init__.py`);
      }
      
      // Check if there are other common Python package issues
      const { stdout: pyFiles } = await execAsync(`find "${repoPath}" -name "*.py" -path "*/app/*" | head -10`);
      if (pyFiles.trim()) {
        fixes.push(`Found Python files in app/: ${pyFiles.split('\n').length} files`);
      }
      
      return fixes.length > 0 ? fixes.join(', ') : 'No fixes needed';
    } catch (error: any) {
      return `Error fixing Python package issues: ${error.message}`;
    }
  }

  /**
   * Execute command with detailed logging
   */
  async executeCommand(command: string, description: string, timeout: number = 30000): Promise<{ stdout: string; stderr: string; success: boolean }> {
    try {
      console.log(`🔧 Executing: ${description}`);
      console.log(`📝 Command: ${command}`);
      
      const { stdout, stderr } = await execAsync(command, { timeout });
      
      if (stderr && stderr.trim()) {
        console.log(`📤 Stderr: ${stderr.trim()}`);
      }
      
      return { stdout, stderr, success: true };
    } catch (error: any) {
      console.error(`❌ Command failed: ${description}`);
      console.error(`📝 Command: ${command}`);
      console.error(`📤 Error: ${error.message}`);
      if (error.stderr) {
        console.error(`📤 Stderr: ${error.stderr}`);
      }
      
      return { 
        stdout: error.stdout || '', 
        stderr: error.stderr || error.message, 
        success: false 
      };
    }
  }

  /**
   * Check permissions and directory structure
   */
  async checkPermissions(repoPath: string, repoName: string): Promise<string> {
    try {
      const checks = [
        `ls -la "${repoPath}"`,
        `ls -la "${repoPath}/app" 2>/dev/null || echo "app directory not found"`,
        `test -r "${repoPath}/docker-compose.yml" && echo "docker-compose.yml readable" || echo "docker-compose.yml not readable"`,
        `test -r "${repoPath}/Dockerfile" && echo "Dockerfile readable" || echo "Dockerfile not readable"`
      ];
      
      let result = `=== Permission Check for ${repoName} ===\n`;
      
      for (const check of checks) {
        try {
          const { stdout } = await execAsync(check, { timeout: 5000 });
          result += `\n--- ${check} ---\n${stdout}\n`;
        } catch (error: any) {
          result += `\n--- ${check} ---\nError: ${error.message}\n`;
        }
      }
      
      return result;
    } catch (error: any) {
      return `Error checking permissions: ${error.message}`;
    }
  }
}