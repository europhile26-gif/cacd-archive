# CACD Archive

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.11.0-blue.svg)]()

An automated scraping and archival system for UK court hearing data from multiple sources, with email notifications for saved searches.

## What it does

CACD Archive scrapes publicly available court hearing data from multiple UK government sources — including the Daily Cause List and Future Hearing List — and stores them in a searchable historical database. Users can save search expressions and receive email alerts when newly archived hearings match.

All source data is UK Crown Copyright, published under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) by HM Courts & Tribunals Service.

## Quick Start

**Prerequisites:** Node.js 18+, MariaDB 10.5+

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
chmod 600 .env
# Edit .env with your database credentials and JWT secret

# Generate a JWT secret
./bin/cacd secret generate

# Run database migrations
npm run migrate

# Create an admin account
./bin/cacd users create

# Start development server
npm run dev
```

Visit `http://localhost:3000` to access the web interface.

## Documentation

- [Configuration Reference](docs/configuration.md) - Environment variables, deployment, PM2 setup
- [API Guide](docs/api.md) - REST API usage and Swagger docs
- [CLI Reference](docs/cli.md) - Command-line tools for administration
- [Security](docs/security.md) - Security features and best practices
- [Architecture](docs/architecture.md) - System design and how the components fit together
- [Developer Guide](docs/developing.md) - Setting up a dev environment, running tests, contributing
- [Scraper Development](docs/scraper-development.md) - How to build a new scraper for an additional data source
- [Changelog](CHANGELOG.md)

## License

MIT - see [LICENSE](LICENSE).
