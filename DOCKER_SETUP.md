# EventBuilder AI - Docker Setup Guide

## Overview

This guide covers how to run EventBuilder AI locally using Docker and Docker Compose for development and production environments.

## Prerequisites

- **Docker**: [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose**: [Install Docker Compose](https://docs.docker.com/compose/install/) (comes with Docker Desktop)
- **Git**: For cloning the repository
- **API Keys**: Gemini API key (minimum required)

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/dgoran/https-github.com-dgoran-eventbuilder-ai.git
cd https-github.com-dgoran-eventbuilder-ai
```

### 2. Create Environment File

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:

```env
GEMINI_API_KEY=your_actual_api_key_here
```

### 3. Build and Run

**Production Mode (Recommended):**
```bash
docker-compose up --build
```

**Development Mode (with hot reload):**
```bash
docker-compose --profile dev up --build eventbuilder-dev
```

### 4. Access the App

Open your browser and navigate to:
- **Main App**: http://localhost:8080
- **Admin Dashboard**: http://localhost:8080#/admin
- **Health Check**: http://localhost:8080/api/health

## Architecture

### Services

#### eventbuilder (Production)
- Full production-optimized image
- Multi-stage build for smaller image size
- Runs on port 8080
- Health checks enabled
- Database persistence

#### eventbuilder-dev (Development)
- Development image with nodemon
- Hot reload support for server changes
- Full dependency installation
- Runs on port 8081
- Useful for active development

## Configuration

### Environment Variables

Key environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key from https://aistudio.google.com/app/apikey |
| `ENCRYPTION_KEY` | No | AES-256 encryption key (64-char hex, has default) |
| `PORT` | No | Server port (default: 8080) |
| `BIGMARKER_API_KEY` | No | BigMarker API integration |
| `ZOOM_API_KEY` | No | Zoom API integration |
| `VIMEO_API_KEY` | No | Vimeo API integration |
| `SMTP_*` | No | Email configuration (see .env.example) |

### Database Configuration

The app uses a JSON-based database (`database.json`) that persists in a Docker volume:

```
database.json
├── events (array)
├── geminiApiKey (encrypted)
├── bigMarkerApiKey
├── zoomApiKey (encrypted)
├── vimeoApiKey (encrypted)
├── smtpHost
├── smtpPort
├── smtpUser
├── smtpPass (encrypted)
└── smtpFrom
```

To access/modify the database:
```bash
docker exec eventbuilder-app cat /app/database.json
```

## Common Commands

### Build the image

```bash
# Production build
docker-compose build

# Development build
docker-compose --profile dev build eventbuilder-dev
```

### Start services

```bash
# Production with auto-rebuild
docker-compose up --build

# Production in background
docker-compose up -d

# Development mode
docker-compose --profile dev up --build eventbuilder-dev

# Specific service only
docker-compose up eventbuilder
```

### Stop services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (clears database)
docker-compose down -v

# Stop without removing containers
docker-compose stop
```

### View logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f eventbuilder

# Last 100 lines
docker-compose logs --tail 100
```

### Execute commands in container

```bash
# Access container shell
docker exec -it eventbuilder-app sh

# Run a command
docker exec eventbuilder-app npm list

# Check database
docker exec eventbuilder-app cat /app/database.json
```

## Features & API Endpoints

### Admin Routes
- **GET /api/admin/config** - Get current configuration
- **POST /api/admin/config** - Update configuration
- **POST /api/admin/test-email** - Test SMTP settings

### Event Management
- **GET /api/events** - List all events
- **POST /api/events** - Create new event
- **PUT /api/events/:id** - Update event
- **DELETE /api/events/:id** - Delete event
- **POST /api/events/:id/registrants** - Add registrant

### Email
- **POST /api/send-registration-email** - Send registration confirmation

### Proxy Routes (Third-party APIs)
- **/* /api/bigmarker/** - BigMarker API proxy
- **/* /api/zoom/** - Zoom API proxy

### Health
- **GET /api/health** - Health check endpoint

## Security Features

### Encryption
- AES-256-GCM encryption for sensitive data
- API keys are encrypted at rest
- Configuration stored in `database.json` with encryption

### Access Control
- All API keys can be stored in database or environment variables
- Environment variables take precedence over database values
- Admin panel requires browser access (no external auth yet)

### Container Security
- Non-root user execution (nodejs user, UID 1001)
- Read-only filesystem where possible
- Health checks for automatic restart on failure

## Development Workflow

### For Backend Development

```bash
# Start development container
docker-compose --profile dev up eventbuilder-dev

# Changes to server.js auto-reload via nodemon
# Edit and save server.js to see changes
```

### For Frontend Development

For frontend development, the dev container rebuilds on changes:

```bash
# The frontend rebuilds automatically if you modify source files
docker-compose --profile dev up eventbuilder-dev
```

To rebuild manually:
```bash
docker-compose exec eventbuilder-dev npm run build
```

### Testing Locally

```bash
# Run the production build locally
docker-compose up --build

# Test API endpoints
curl http://localhost:8080/api/health

# Access admin panel
open http://localhost:8080/#/admin
```

## Troubleshooting

### Port Already in Use

```bash
# Find and stop container using port 8080
docker ps
docker stop <container_id>

# Or use a different port in docker-compose.yml
# Change "8080:8080" to "8081:8080"
```

### Database Issues

```bash
# Clear database and start fresh
docker-compose down -v
docker-compose up --build

# Backup current database
docker cp eventbuilder-app:/app/database.json ./database.json.backup
```

### Container Won't Start

```bash
# View detailed logs
docker-compose logs eventbuilder

# Check if port is available
lsof -i :8080  # macOS/Linux
netstat -ano | findstr :8080  # Windows
```

### Out of Memory

Increase Docker memory allocation:
- Docker Desktop: Settings → Resources → Memory → Increase
- Or use `docker-compose.yml` resource limits:

```yaml
services:
  eventbuilder:
    mem_limit: 1g
    memswap_limit: 1g
```

## Performance Optimization

### Build Optimization
- Multi-stage build reduces final image size
- Only production dependencies in final image
- Alpine Linux base image for minimal footprint

### Runtime Optimization
- In-memory database caching for fast reads
- Health checks with reasonable intervals
- Compression-ready (add gzip middleware if needed)

### Image Size

```bash
# Check image size
docker images eventbuilder

# Expected sizes:
# Production: ~200-250 MB
# Development: ~400-500 MB
```

## Deployment

### To Cloud Platforms

#### Google Cloud Run
```bash
docker build -t eventbuilder:latest .
docker tag eventbuilder:latest gcr.io/PROJECT_ID/eventbuilder:latest
docker push gcr.io/PROJECT_ID/eventbuilder:latest
gcloud run deploy eventbuilder --image gcr.io/PROJECT_ID/eventbuilder:latest
```

#### AWS ECS
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
docker build -t eventbuilder:latest .
docker tag eventbuilder:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/eventbuilder:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/eventbuilder:latest
```

#### Docker Hub
```bash
docker build -t yourusername/eventbuilder:latest .
docker push yourusername/eventbuilder:latest
```

## Next Steps

1. **Add API Keys**: Update `.env.local` with your actual API keys
2. **Test Locally**: Run `docker-compose up --build`
3. **Access Admin**: Open http://localhost:8080/#/admin
4. **Configure Services**: Set up SMTP, integrations, etc.
5. **Deploy**: Push to your chosen hosting platform

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [EventBuilder Repository](https://github.com/dgoran/https-github.com-dgoran-eventbuilder-ai)

## Support

For issues or questions:
1. Check the logs: `docker-compose logs -f`
2. Review the troubleshooting section above
3. Check API health: `curl http://localhost:8080/api/health`
4. Open an issue on the GitHub repository
