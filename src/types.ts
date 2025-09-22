export interface GitHubPushEvent {
  ref: string;
  repository: {
    name: string;
    full_name: string;
    clone_url: string;
    ssh_url: string;
  };
  head_commit: {
    id: string;
    message: string;
    timestamp: string;
  };
  pusher: {
    name: string;
    email: string;
  };
}

export interface RepositoryInfo {
  name: string;
  path: string;
  currentBranch: string;
  hasDockerCompose: boolean;
}

export interface DeploymentResult {
  repository: string;
  branch: string;
  success: boolean;
  message: string;
  timestamp: string;
}
