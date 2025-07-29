# SharePoint Connector v2 - Docker Setup Guide

This guide explains how to run the SharePoint Connector v2 using Docker Compose for easy deployment and testing.

## Quick Start

1. **Clone and Navigate to the Repository**
   ```bash
   git clone <repository-url>
   cd sharepoint-connector-v2
   ```

2. **Configure Environment Variables**
   Edit the environment variables in `docker-compose.yml` with your actual values (see configuration section below).

3. **Build and Run**
   ```bash
   docker-compose up --build
   ```

4. **Access the Services**
   - **Main Application**: http://localhost:3000
   - **Health Check**: http://localhost:3000/health
   - **Metrics**: http://localhost:3000/metrics
   - **Bull Board (Queue Dashboard)**: http://localhost:3000/admin/queues
   - **Redis**: localhost:6379

## Configuration

Before running the application, you need to configure the following environment variables in `docker-compose.yml`:

### SharePoint Configuration
Replace these with your Azure App Registration details:
```yaml
- GRAPH_CLIENT_ID=your-actual-client-id
- GRAPH_CLIENT_SECRET=your-actual-client-secret
- GRAPH_TENANT_ID=your-actual-tenant-id
- SHAREPOINT_SITES=https://yourtenant.sharepoint.com/sites/site1,https://yourtenant.sharepoint.com/sites/site2
```

### Unique AI Configuration
Replace these with the values provided by Unique AI:
```yaml
- UNIQUE_SCOPE_ID=your-actual-scope-id
- ZITADEL_PROJECT_ID=your-actual-project-id
- ZITADEL_CLIENT_ID=your-actual-zitadel-client-id
- ZITADEL_CLIENT_SECRET=your-actual-zitadel-client-secret
```

## Services Overview

### Redis
- **Image**: redis:7-alpine
- **Port**: 6379
- **Purpose**: Queue storage for BullMQ
- **Persistence**: Data persisted in `redis_data` volume
- **Health Check**: Configured with redis-cli ping

### SharePoint Connector App
- **Build**: From local Dockerfile
- **Port**: 3000
- **Purpose**: Main application with job processing
- **Dependencies**: Waits for Redis to be healthy
- **Health Check**: HTTP GET to /health endpoint

## Available Endpoints

Once running, you can access:

### Application Endpoints
- `GET /health` - Health check endpoint
- `GET /metrics` - Prometheus metrics
- `GET /admin/queues` - Bull Board dashboard for queue monitoring

### Bull Board Dashboard
The Bull Board dashboard at http://localhost:3000/admin/queues provides:
- Real-time queue monitoring
- Job status tracking (pending, active, completed, failed)
- Job details and logs
- Queue statistics
- Manual job management

## Development Commands

```bash
# Build and start all services
docker-compose up --build

# Start services in background
docker-compose up -d

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f sharepoint-connector

# Stop all services
docker-compose down

# Stop and remove volumes (clears Redis data)
docker-compose down -v

# Rebuild just the app
docker-compose build sharepoint-connector
```

## Monitoring and Debugging

### Queue Monitoring
Visit http://localhost:3000/admin/queues to:
- Monitor job processing in real-time
- View failed jobs and their error messages
- Retry failed jobs manually
- See queue statistics and performance metrics

### Application Logs
```bash
# View real-time logs
docker-compose logs -f sharepoint-connector

# View Redis logs
docker-compose logs -f redis
```

### Health Checks
```bash
# Check application health
curl http://localhost:3000/health

# Check metrics
curl http://localhost:3000/metrics

# Check Redis connection
docker-compose exec redis redis-cli ping
```

## Production Deployment

For production deployment:

1. **Environment Variables**: Use proper secrets management instead of plain text in docker-compose.yml
2. **Resource Limits**: Add memory and CPU limits to services
3. **Networking**: Use proper network isolation
4. **Persistence**: Ensure Redis data persistence strategy
5. **Monitoring**: Set up proper logging and monitoring infrastructure
6. **Security**: Run with non-root users (already configured in Dockerfile)

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Ensure Redis container is healthy: `docker-compose ps`
   - Check Redis logs: `docker-compose logs redis`

2. **Authentication Errors**
   - Verify all credential environment variables are set correctly
   - Check application logs for specific error messages

3. **SharePoint Access Issues**
   - Ensure your Azure App Registration has proper permissions
   - Verify tenant ID and site URLs are correct

4. **Queue Not Processing**
   - Check Bull Board dashboard for job status
   - Verify Redis connection in application logs
   - Ensure processing concurrency is set appropriately

### Container Status
```bash
# Check all containers
docker-compose ps

# Check health status
docker-compose exec sharepoint-connector wget --quiet --tries=1 --spider http://localhost:3000/health || echo "Health check failed"
```

## Architecture Overview

The Docker Compose setup provides:
- **Scalable Architecture**: Redis-based queue system
- **Monitoring**: Built-in Bull Board dashboard
- **Health Checks**: Application and service health monitoring  
- **Persistence**: Redis data persistence across restarts
- **Network Isolation**: Services communicate via internal network
- **Security**: Non-root user execution in containers 