# CACD Archive

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.7.0-blue.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

> Automated web scraping and archival system for UK Court of Appeal (Criminal Division) Daily Cause Lists

## What is CACD Archive?

CACD Archive automatically scrapes, parses, and archives daily cause lists from the Court of Appeal (Criminal Division) of the United Kingdom. The system provides a searchable historical database of court hearings with user authentication, role-based access control, and administrative tools.

### Key Features

- 🔄 **Automated Scraping** - Captures hearing data every 2 hours throughout the day
- 📊 **Historical Archive** - Permanent storage with full-text search across all fields
- 🔐 **User Authentication** - JWT-based login with role-based access control
- 👥 **User Management** - Admin panel and CLI tools for managing accounts
- � **Saved Searches** - Email notifications when new hearings match your saved searches
- �🔍 **REST API** - Public and authenticated endpoints with Swagger documentation
- 🌐 **Web Interface** - Responsive frontend with clean URLs and dynamic navigation
- 📧 **Error Notifications** - Email alerts when site structure changes
- ⚡ **High Performance** - Built with Fastify for fast API responses
- 🔒 **Security Hardened** - Rate limiting, CSP, HSTS, bcrypt passwords, XSS protection

## Quick Start

### Prerequisites

- Node.js 18+
- MariaDB 10.5+
- SMTP server (for email notifications)

### Installation

```bash
# Clone the repository
git clone https://github.com/europhile26-gif/cacd-archive.git
cd cacd-archive

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your database credentials and settings

# Run database migrations
npm run migrate

# Create an administrator account
./bin/cacd users create

# Start development server
npm run dev
```

Visit `http://localhost:3000` to access the web interface.  
Visit `http://localhost:3000/login` to log in with your admin account.

### Production Deployment

```bash
# Build optimized frontend assets
npm run build

# Start with PM2 (process manager)
pm2 start ecosystem.config.js
pm2 save
```

## Configuration

Key environment variables (see `.env.example` for complete list):

```bash
# Application
NODE_ENV=production
PORT=3000

# Database
DB_HOST=localhost
DB_NAME=cacd_archive
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Authentication (v1.6.0+)
JWT_SECRET=your-secret-key-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
PASSWORD_MIN_LENGTH=12
ALLOW_PUBLIC_REGISTRATION=false
REQUIRE_ADMIN_APPROVAL=true

# Scraping
SCRAPE_INTERVAL_HOURS=2
SCRAPE_ON_STARTUP=true

# Email Notifications
EMAIL_NOTIFICATIONS_ENABLED=true
EMAIL_RECIPIENT_DATA_ERRORS=admin@example.com
SMTP_HOST=smtp.example.com
SMTP_USER=alerts@example.com
SMTP_PASSWORD=your_password

# API
RECORDS_PER_PAGE=20
API_RATE_LIMIT_MAX=100
```

## API Usage

Interactive API documentation is available at `/api/docs` when the server is running.

### Example Requests

```bash
# Get hearings for a specific date
curl "http://localhost:3000/api/v1/hearings?date=2025-12-18&limit=20"

# Search by case number
curl "http://localhost:3000/api/v1/hearings?search=202404094"

# Filter by division and date range
curl "http://localhost:3000/api/v1/hearings?division=Criminal&dateFrom=2025-12-01&dateTo=2025-12-31"

# Get available dates with hearing counts
curl "http://localhost:3000/api/v1/dates"
```

## Documentation

### Architecture & Implementation

- [Project Roadmap](docs/project-roadmap.md) - Current milestones and planned features
- [Implementation Plan](docs/implementation-plan.md) - Technical architecture and design
- [Requirements Specification](docs/requirements.md) - Original project requirements

### Algorithms & Technical Details

- [Link Discovery Algorithm](docs/algorithm-link-discovery.md) - How we find daily cause lists
- [Table Parsing Algorithm](docs/algorithm-table-parsing.md) - How we extract hearing data

### Operations & Security

- [PM2 Deployment Guide](docs/pm2-deployment.md) - Production deployment instructions
- [Security Documentation](docs/security.md) - Security features and best practices
- [Security Audit Report](docs/security-audit.md) - Comprehensive security review

### Project Information

- [Changelog](CHANGELOG.md) - Version history and release notes
- [License](LICENSE) - MIT License

## Technology Stack

- **Runtime:** Node.js 18+
- **API Framework:** Fastify 5.x
- **Database:** MariaDB 10.5+
- **HTML Parser:** Cheerio 1.0+
- **Process Manager:** PM2
- **Frontend:** Bootstrap 5 + Vanilla JavaScript
- **Build Tool:** esbuild
- **Email:** Nodemailer + Handlebars
- **Security:** @fastify/helmet, rate limiting, input validation

## CLI Tools

```bash
# User management
./bin/cacd users create          # Create a new user (interactive)
./bin/cacd users list             # List all users
./bin/cacd users show --id 1      # Show user details
./bin/cacd users approve --id 1   # Approve pending user
./bin/cacd users deactivate --id 1  # Deactivate user account

# Database
./bin/cacd db migrate             # Run database migrations

# Scraper
./bin/cacd scraper run            # Run scraper manually

# System
./bin/cacd system info            # Show system information

# Email testing
node src/cli/test-email.js
```

## Project Status

**Current Version:** 1.6.0  
**Status:** ✅ Production Ready with Authentication

The core application is complete and stable with full user authentication and role-based access control. Currently harvesting hearing data from the UK Court of Appeal website. See [docs/project-roadmap.md](docs/project-roadmap.md) for planned enhancements including saved searches with notifications.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Court of Appeal, Criminal Division for publishing daily cause lists
- UK Courts & Tribunals Judiciary
