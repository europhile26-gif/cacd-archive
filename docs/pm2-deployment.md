# PM2 Deployment Guide

This guide covers deploying CACD Archive with PM2 process manager for production environments.

## Prerequisites

- Node.js 18+ installed
- PM2 installed globally: `npm install -g pm2`
- MariaDB/MySQL database configured
- Environment variables configured in `.env`

## Basic Deployment

### 1. Install Dependencies

```bash
npm install --production
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
nano .env
```

Key settings:

- `NODE_ENV=production`
- `PORT=3000`
- `LOG_LEVEL=info`
- `SCRAPE_ON_STARTUP=true` (for first run)
- Database credentials
- Email settings (if using notifications)

### 3. Run Database Migrations

```bash
npm run migrate
```

### 4. Start with PM2

```bash
pm2 start ecosystem.config.js
```

### 5. Save PM2 Process List

```bash
pm2 save
```

### 6. Configure Auto-Start on Boot

```bash
pm2 startup
# Follow the instructions output by the command
```

## PM2 Commands

### Process Management

```bash
# Start application
pm2 start ecosystem.config.js

# Stop application
pm2 stop cacd-archive

# Restart application
pm2 restart cacd-archive

# Reload application (zero-downtime)
pm2 reload cacd-archive

# Delete from PM2
pm2 delete cacd-archive

# View process list
pm2 list

# View process details
pm2 show cacd-archive
```

### Monitoring

```bash
# Real-time logs
pm2 logs cacd-archive

# Last 100 lines
pm2 logs cacd-archive --lines 100

# Error logs only
pm2 logs cacd-archive --err

# Real-time monitoring dashboard
pm2 monit

# Web-based dashboard
pm2 plus
```

### Log Management

```bash
# Flush all logs
pm2 flush

# Rotate logs
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

## Cluster Mode (Optional)

For high-traffic deployments, you can run multiple instances in cluster mode.

### Important: Scheduler Considerations

**Only one instance should run the scheduler to avoid duplicate scraping.**

The application checks `NODE_APP_INSTANCE === 0` before starting the scheduler. Only instance 0 will run cron jobs.

### Configure Cluster Mode

Edit `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'cacd-archive',
      script: './src/index.js',
      instances: 'max', // One per CPU core, or specify number
      exec_mode: 'cluster',
      instance_var: 'NODE_APP_INSTANCE',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        LOG_LEVEL: 'info'
      }
    }
  ]
};
```

### Start Cluster

```bash
pm2 start ecosystem.config.js
pm2 save
```

## Production Checklist

- [ ] Environment variables configured in `.env`
- [ ] Database migrations run successfully
- [ ] `NODE_ENV=production` set
- [ ] Log rotation configured
- [ ] PM2 startup script installed
- [ ] Process list saved with `pm2 save`
- [ ] Firewall configured (allow port 3000)
- [ ] Reverse proxy configured (nginx/Apache)
- [ ] SSL certificate installed
- [ ] Monitoring configured
- [ ] Backup strategy in place
- [ ] Email notifications tested (if enabled)

## Nginx Reverse Proxy (Recommended)

Example nginx configuration:

```nginx
server {
    listen 80;
    server_name cacd-archive.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

For HTTPS with Let's Encrypt:

```bash
sudo certbot --nginx -d cacd-archive.example.com
```

## Monitoring & Alerts

### PM2 Plus (Optional)

PM2 Plus provides real-time monitoring, metrics, and alerts.

```bash
pm2 plus
# Follow registration instructions
pm2 restart cacd-archive --update-env
```

### System Monitoring

Consider setting up:

- **Uptime monitoring**: UptimeRobot, Pingdom
- **Error tracking**: Sentry, Rollbar
- **Log aggregation**: Loggly, Papertrail
- **Database monitoring**: Percona Monitoring

## Troubleshooting

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs cacd-archive --err

# Check environment variables
pm2 show cacd-archive

# Restart PM2 daemon
pm2 kill
pm2 resurrect
```

### Memory Issues

```bash
# Check memory usage
pm2 monit

# Set memory limit in ecosystem.config.js
max_memory_restart: '500M'
```

### Scheduler Not Running

```bash
# Check instance number
pm2 show cacd-archive | grep NODE_APP_INSTANCE

# Should be 0 for at least one instance
# Check logs for "Scheduler started" message
pm2 logs cacd-archive | grep Scheduler
```

### Database Connection Issues

```bash
# Test database connection
mysql -u [user] -p[password] -h [host] [database]

# Check connection pool limits
# Verify DB_CONNECTION_LIMIT in .env
```

## Backup & Recovery

### Database Backup

```bash
# Create backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -u [user] -p[password] cacd_archive > backup_$DATE.sql
gzip backup_$DATE.sql
```

### Schedule with Cron

```bash
# Edit crontab
crontab -e

# Add daily backup at 2am
0 2 * * * /path/to/backup-script.sh
```

### Restore from Backup

```bash
gunzip backup_20251211_020000.sql.gz
mysql -u [user] -p[password] cacd_archive < backup_20251211_020000.sql
pm2 restart cacd-archive
```

## Updates & Maintenance

### Update Application

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install --production

# Run migrations
npm run migrate

# Reload application (zero-downtime)
pm2 reload cacd-archive
```

### Update Node.js

```bash
# Using nvm
nvm install 18
nvm use 18

# Reinstall PM2
npm install -g pm2

# Restart application
pm2 restart cacd-archive
```

## Security Best Practices

1. **Run as non-root user**
2. **Keep Node.js and dependencies updated**
3. **Use environment variables for secrets**
4. **Enable firewall (ufw/iptables)**
5. **Use HTTPS/SSL certificates**
6. **Regular security audits**: `npm audit`
7. **Rate limiting** (already configured in application)
8. **Database user with minimal privileges**
9. **Regular backups**
10. **Monitor logs for suspicious activity**

## Support

For issues or questions:

- Check logs: `pm2 logs cacd-archive`
- Review documentation in `docs/`
- Check GitHub issues
- Review application logs in `logs/`
