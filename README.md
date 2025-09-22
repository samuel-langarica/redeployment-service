# Redeployment Service

A GitHub webhook service that automatically redeploys Docker Compose applications when code is pushed to matching repositories and branches.

## 🚀 Features

- **GitHub Webhook Integration**: Listens for push events with HMAC signature validation
- **Branch-Specific Deployments**: Only deploys when the pushed branch matches the repository's current branch
- **Docker Compose Integration**: Automatically runs `docker compose down && docker compose up --build`
- **Multi-Repository Support**: Monitors multiple repositories in a single `/apps` directory
- **SSH Key Inheritance**: Uses the server's SSH keys for Git operations
- **Traefik Ready**: Pre-configured with Traefik labels for reverse proxy integration
- **Health Monitoring**: Built-in health checks and repository status endpoints

## 📋 Prerequisites

- Docker and Docker Compose installed on the server
- SSH key configured for GitHub access
- Repositories cloned in the `/apps` directory
- Each repository should have a `docker-compose.yml` file

## 🛠️ Setup

### 1. Clone and Configure

```bash
# Clone this repository
cd ~/apps
git clone <your-repo-url> redeployment-service
cd redeployment-service

# Copy environment file
cp env.example .env

# Edit environment variables
nano .env
```

### 2. Environment Configuration

Edit `.env` file:

```bash
# GitHub Webhook Secret (get this from your GitHub repo settings)
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here

# Server port (defaults to 3000)
PORT=3000

# Apps directory path (defaults to /apps)
APPS_DIR=/apps
```

### 3. Deploy the Service

```bash
# Build and start the service
docker-compose up -d

# Check logs
docker-compose logs -f
```

### 4. Configure GitHub Webhooks

For each repository you want to auto-deploy:

1. Go to **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL**: `http://your-server-ip/github-webhook`
3. **Content type**: `application/json`
4. **Secret**: (same as `GITHUB_WEBHOOK_SECRET` in your `.env` file)
5. **Events**: Select "Just the push event"
6. **Active**: ✅ Checked

### 5. Repository Setup

For each project you want to auto-deploy:

```bash
# Clone your repositories into ~/apps
cd ~/apps
git clone git@github.com:username/project-name.git
cd project-name

# Checkout the branch you want to auto-deploy
git checkout main  # or whatever branch

# Ensure you have a docker-compose.yml file
ls docker-compose.yml
```

## 🔄 How It Works

1. **Developer pushes** code to any branch in any repository
2. **GitHub sends webhook** to `http://your-server-ip/github-webhook`
3. **Service validates** the webhook signature using your secret
4. **Service scans** all folders in `~/apps` (except redeployment-service)
5. **For each folder**:
   - Checks if it's a Git repository
   - Gets the current branch using `git branch --show-current`
   - Checks if `docker-compose.yml` exists
   - If repository name and branch match the push event:
     - Runs `git pull origin <branch>` to get latest changes
     - Runs `docker compose down && docker compose up --build`
6. **Logs everything** for debugging and monitoring

## 📁 Directory Structure

```
~/apps/
├── redeployment-service/          # This service
│   ├── src/
│   ├── docker-compose.yml
│   ├── .env
│   └── ...
├── my-frontend/                   # Auto-deploys on main branch
│   ├── docker-compose.yml
│   └── ...
├── my-backend/                    # Auto-deploys on develop branch
│   ├── docker-compose.yml
│   └── ...
└── my-api/                        # Auto-deploys on main branch
    ├── docker-compose.yml
    └── ...
```

## 🔗 API Endpoints

- `GET /` - Service information
- `POST /github-webhook` - GitHub webhook endpoint
- `GET /health` - Health check with Docker status
- `GET /repositories` - List all monitored repositories

## 🐳 Docker Configuration

The service is configured to:
- Mount `~/.ssh` for GitHub access
- Mount `~/apps` for repository access
- Use Traefik labels for reverse proxy integration
- Run as non-root user for security

## 🔧 Troubleshooting

### Check Service Status
```bash
# View logs
docker-compose logs -f

# Check health
curl http://localhost:3000/health

# List repositories
curl http://localhost:3000/repositories
```

### Common Issues

1. **SSH Key Access**: Ensure your SSH key is in `~/.ssh/` and has access to GitHub
2. **Repository URLs**: Make sure repositories are cloned with SSH URLs (`git@github.com:user/repo.git`)
3. **Docker Compose**: Ensure each repository has a `docker-compose.yml` file
4. **Permissions**: Check that the Docker container can access the `/apps` directory

### Debug Mode

To run in development mode:

```bash
# Install dependencies
npm install

# Run in development
npm run dev
```

## 🔒 Security

- Webhook signatures are validated using HMAC-SHA256
- SSH keys are mounted read-only
- Service runs as non-root user
- No hardcoded credentials

## 📝 License

MIT License - see LICENSE file for details

