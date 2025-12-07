# VoteAPI Docker Setup

## Quick Start

### Development Mode

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop all services
docker-compose down
```

### Production Mode

```bash
# Copy and configure production environment
cp .env.production.example .env.production
# Edit .env.production with your production values

# Start production services
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# Scale API instances (behind nginx)
docker-compose -f docker-compose.prod.yml up -d --scale api=3
```

## Services

### Development Stack (`docker-compose.yml`)

| Service         | Port  | Description         |
| --------------- | ----- | ------------------- |
| api             | 57788 | VoteAPI Application |
| mongo           | 27017 | MongoDB Database    |
| redis           | 6379  | Redis Cache         |
| mailhog         | 8025  | Email Testing UI    |
| mongo-express   | 8081  | MongoDB Admin UI    |
| redis-commander | 8082  | Redis Admin UI      |

### Production Stack (`docker-compose.prod.yml`)

| Service         | Port    | Description                   |
| --------------- | ------- | ----------------------------- |
| api             | 57788   | VoteAPI Application           |
| mongo-primary   | 27017   | MongoDB Primary (Replica Set) |
| mongo-secondary | -       | MongoDB Secondary             |
| mongo-arbiter   | -       | MongoDB Arbiter               |
| redis           | 6379    | Redis with Persistence        |
| nginx           | 80, 443 | Reverse Proxy                 |

## URLs (Development)

- **API**: http://localhost:57788
- **API Health**: http://localhost:57788/health
- **Swagger Docs**: http://localhost:57788/api-docs
- **MongoDB Express**: http://localhost:8081 (admin/admin123)
- **Redis Commander**: http://localhost:8082
- **MailHog**: http://localhost:8025

## Common Commands

```bash
# Build images
docker-compose build

# Rebuild and start
docker-compose up -d --build

# View API logs
docker-compose logs -f api

# Shell into API container
docker-compose exec api sh

# Shell into MongoDB
docker-compose exec mongo mongosh

# Shell into Redis
docker-compose exec redis redis-cli

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v

# Restart single service
docker-compose restart api
```

## Environment Variables

1. **Development**: Uses inline environment variables in `docker-compose.yml`
2. **Custom Development**: Copy `.env.docker` to `.env.docker.local` and customize
3. **Production**: Copy `.env.production.example` to `.env.production` and configure

## Data Persistence

Data is persisted in named Docker volumes:

- `voteapi-mongo-data` - MongoDB data
- `voteapi-redis-data` - Redis data
- `voteapi-uploads` - Uploaded files
- `voteapi-logs` - Application logs

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs api

# Check container status
docker-compose ps

# Restart with rebuild
docker-compose up -d --build --force-recreate
```

### MongoDB connection issues
```bash
# Check MongoDB is healthy
docker-compose exec mongo mongosh --eval "db.adminCommand('ping')"

# View MongoDB logs
docker-compose logs mongo
```

### Redis connection issues
```bash
# Check Redis is healthy
docker-compose exec redis redis-cli ping

# View Redis logs
docker-compose logs redis
```

### Clear everything and start fresh
```bash
# Stop all containers
docker-compose down

# Remove all volumes (WARNING: deletes all data)
docker-compose down -v

# Remove all images
docker-compose down --rmi all

# Start fresh
docker-compose up -d --build
```

## SSL/TLS (Production)

1. Place your SSL certificates in `docker/nginx/ssl/`:
   - `cert.pem` - SSL certificate
   - `key.pem` - Private key

2. Uncomment the HTTPS server block in `docker/nginx/nginx.conf`

3. Update `HTTPS_ENABLED=true` in your `.env.production`

## Backup & Restore

### MongoDB Backup
```bash
# Backup
docker-compose exec mongo mongodump --out /data/backup

# Restore
docker-compose exec mongo mongorestore /data/backup
```

### Redis Backup
```bash
# Trigger RDB save
docker-compose exec redis redis-cli BGSAVE
```

## Health Checks

All services include health checks. View status:

```bash
docker-compose ps
```

A healthy stack should show all services as "healthy".

