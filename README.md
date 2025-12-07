# 🗳️ VoteAPI - Enterprise Voting & Polling System

A comprehensive, secure, and scalable RESTful API for managing elections, voting, and public polls. Built with Node.js, Express, and MongoDB, VoteAPI provides enterprise-grade features for organizations, schools, associations, and institutions to conduct transparent and secure digital elections.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.1-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.19-green.svg)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

---

## Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [API Documentation](#-api-documentation)
- [Security Features](#-security-features)
- [Deployment](#-deployment)
- [Testing](#-testing)
- [Monitoring &amp; Logging](#-monitoring--logging)
- [Contributing](#-contributing)
- [License](#-license)

---

## Features

### Election Management

- **Complete Election Lifecycle**: Setup, registration, voting, and results
- **Multi-Phase Elections**: Automated phase transitions (Setup → Registration → Campaign → Voting → Results)
- **Position-Based Voting**: Support for multiple positions per election
- **Candidate Management**: Nomination, approval, and campaign management
- **Voter Registry**: Bulk registration with CSV import/export
- **Real-Time Results**: Live vote counting via WebSocket
- **Result Export**: CSV/PDF export functionality

### Public Poll System

- **Rating Polls**: Rate single items (products, services, restaurants, etc.)
- **Comparison Polls**: Compare 2-10 options and vote for the best
- **Public/Private Polls**: Creator-controlled visibility
- **Anonymous Voting**: Support for both registered and anonymous users
- **Email Notifications**: Automatic results delivery to registered participants
- **Statistics**: Vote counts, percentages, and detailed analytics

### Security & Authentication

- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access Control**: Multiple user roles (Super Admin, Admin, School Admin, Association Admin, Election Officer)
- **Token Blacklisting**: Secure logout with token revocation
- **Secret Code System**: Unique codes for voter authentication
- **Vote Encryption**: End-to-end vote encryption
- **Audit Logging**: Comprehensive audit trail
- **Rate Limiting**: Protection against abuse
- **CSRF Protection**: Cross-site request forgery prevention

### Analytics & Reporting

- **API Usage Statistics**: Track API usage and performance
- **Vote Analytics**: Detailed voting statistics and trends
- **User Behavior Tracking**: Monitor user activity
- **Poll Analytics**: Poll performance metrics
- **Turnout Analysis**: Voter participation rates
- **Custom Reports**: Generate custom reports and exports

### Notifications

- **Email Notifications**: Vote confirmations, secret codes, results
- **Multi-Channel Support**: Email, SMS, and in-app notifications
- **Scheduled Notifications**: Automated deadline reminders
- **Template System**: Customizable email templates

### Performance & Scalability

- **Result Caching**: Fast result retrieval with caching
- **Redis Integration**: Optional Redis caching for high performance
- **Background Jobs**: Automated tasks with cron scheduling
- **Real-Time Updates**: WebSocket support for live updates
- **File Upload**: Support for images and documents (S3, Cloudinary)

---

## 🛠️ Tech Stack

### Core

| Technology | Version | Purpose                 |
| ---------- | ------- | ----------------------- |
| Node.js    | 18+     | Runtime environment     |
| Express.js | 5.1     | Web framework           |
| MongoDB    | 8.19    | Database (Mongoose ODM) |
| Redis      | 5.9     | Caching (optional)      |

### Security

- **bcryptjs** - Password hashing
- **helmet** - Security headers
- **express-rate-limit** - Rate limiting
- **csurf** - CSRF protection
- **xss-clean** - XSS protection
- **express-mongo-sanitize** - NoSQL injection prevention

### Real-Time & Communication

- **Socket.io 4.8** - WebSocket support
- **nodemailer** - Email delivery
- **Twilio** - SMS notifications

### File Handling

- **multer** - File uploads
- **sharp** - Image processing
- **AWS S3 / Cloudinary** - Cloud storage

### Monitoring

- **Sentry** - Error tracking
- **Winston / Pino** - Logging
- **Swagger** - API documentation

---

## Architecture

### System Overview

VoteAPI follows a **layered, service-oriented architecture** designed for scalability, maintainability, and security.

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  (Web App, Mobile App, Third-party Integrations)            │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS/REST API / WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                    API Gateway Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Rate Limiting│  │   CORS       │  │   Security   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  Application Layer                           │
│  ┌────────────────────────────────────────────────────┐     │
│  │              Express.js Server                      │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │     │
│  │  │ Routes   │→ │Controllers│→ │ Services │          │     │
│  │  └──────────┘  └──────────┘  └──────────┘          │     │
│  │                      │                              │     │
│  │              ┌───────▼───────┐                      │     │
│  │              │    Models     │                      │     │
│  │              └───────────────┘                      │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌────────────────────┐  ┌─────────────────────────────┐    │
│  │  Socket.io Server  │  │  Background Job Service     │    │
│  │  (Real-time)       │  │  (Cron Jobs)                │    │
│  └────────────────────┘  └─────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼──────┐ ┌────▼──────┐
│   MongoDB    │ │   Redis   │ │  External │
│  (Primary)   │ │  (Cache)  │ │ Services  │
│              │ │           │ │           │
│  - Elections │ │ - Sessions│ │ - Twilio  │
│  - Votes     │ │ - Rate    │ │ - S3      │
│  - Users     │ │   Limits  │ │ - Sentry  │
│  - Polls     │ │ - Cache   │ │           │
└──────────────┘ └───────────┘ └───────────┘
```

### Architecture Layers

```
┌─────────────────────────────────────┐
│         Routes Layer                 │  ← HTTP endpoints, request routing
├─────────────────────────────────────┤
│         Controllers Layer            │  ← Request handling, validation
├─────────────────────────────────────┤
│         Services Layer               │  ← Business logic, external integrations
├─────────────────────────────────────┤
│         Models Layer                 │  ← Data models, database operations
├─────────────────────────────────────┤
│         Database Layer               │  ← MongoDB, Redis
└─────────────────────────────────────┘
```

### Project Structure

```
voteapi/
├── config/              # Configuration files
│   ├── dbConfig.js      # Database connection
│   ├── cors.js          # CORS configuration
│   ├── security.js      # Security settings
│   ├── swagger.js       # API documentation
│   └── ...
├── controllers/         # Request handlers
│   ├── auth/            # Authentication
│   ├── election/        # Election management
│   ├── vote/            # Vote handling
│   ├── poll/            # Poll management
│   ├── analytics/       # Analytics (admin & user)
│   └── ...
├── middleware/          # Express middleware
│   ├── authMiddleware.js
│   ├── errorHandler.js
│   ├── apiRequestLogger.js
│   ├── userRateLimiter.js
│   └── ...
├── models/              # Mongoose models
│   ├── User.js
│   ├── Election.js
│   ├── Vote.js
│   ├── Poll.js
│   └── ...
├── routes/              # API routes
│   ├── auth.routes.js
│   ├── election.routes.js
│   ├── vote.routes.js
│   ├── poll.routes.js
│   └── ...
├── services/            # Business logic
│   ├── authService.js
│   ├── emailService.js
│   ├── analyticsService.js
│   ├── cacheService.js
│   └── ...
├── socket/              # WebSocket handlers
│   ├── socketServer.js
│   └── socketHandlers.js
├── templates/           # Email templates (Handlebars)
├── utils/               # Utility functions
├── validators/          # Input validation
├── docker/              # Docker configuration
├── scripts/             # Utility scripts
├── app.js               # Express app
└── server.js            # Server entry point
```

### Services Architecture

| Service                    | Purpose                            |
| -------------------------- | ---------------------------------- |
| **Auth Service**           | Authentication and authorization   |
| **Email Service**          | Email notifications with templates |
| **Notification Service**   | Multi-channel notifications        |
| **Analytics Service**      | Usage statistics and analytics     |
| **Integration Service**    | Webhooks and external integrations |
| **Cache Service**          | Caching layer (Redis/Memory)       |
| **Background Job Service** | Scheduled tasks and cron jobs      |
| **Template Service**       | Handlebars template rendering      |

### Database Schema

```
User ──┬──> Elections (createdBy)
       ├──> Votes (voterId)
       ├──> Notifications (recipientId)
       └──> LoginLogs (userId)

Election ──┬──> Positions
           ├──> Votes
           ├──> Candidates
           └──> VoterRegistry

Position ──┬──> Candidates
           └──> Votes

Poll ────> PollVotes
```

### Data Flow

**Authentication Flow:**

```
Client → POST /api/auth/login
    → Auth Controller
    → Auth Service (validate credentials)
    → User Model (verify password)
    → Generate JWT tokens
    → LoginLog Model (log login)
    → Return tokens to client
```

**Voting Flow:**

```
Client → POST /api/votes
    → Auth Middleware (verify token)
    → Vote Controller
    → Validation Middleware
    → Vote Service (validate secret code)
    → Vote Model (create vote)
    → Election Model (update statistics)
    → Socket.io (emit real-time update)
    → Notification Service (send confirmation)
    → Response to client
```

---

## Prerequisites

- **Node.js** 18.0 or higher
- **MongoDB** 6.0 or higher (local or Atlas)
- **npm** or **yarn** package manager
- **Redis** (optional, for caching)

### Optional Services

- **AWS S3** account (for file storage)
- **Cloudinary** account (for image hosting)
- **Sentry** account (for error tracking)
- **Twilio** account (for SMS notifications)

---

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd voteapi
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

```bash
cp env.example .env
```

Edit `.env` with your configuration.

### 4. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server starts on `http://localhost:57788`

---

## Configuration

### Essential Environment Variables

```env
# Server
NODE_ENV=development
PORT=57788
HOST=0.0.0.0

# Database
MONGODB_URI=mongodb://localhost:27017/voteapi

# JWT
JWT_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Optional Configuration

```env
# Redis
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=false

# Sentry
SENTRY_DSN=your-sentry-dsn
SENTRY_ENABLED=false

# AWS S3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name

# Twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
SMS_ENABLED=false
```

See `env.example` for all available configuration options.

---

## API Documentation

### Base URL

```
http://localhost:57788/api
```

### Interactive Documentation

Swagger UI is available at: `http://localhost:57788/api-docs`

### Authentication

Include the JWT token in the Authorization header:

```http
Authorization: Bearer <access_token>
```

### API Endpoints

#### Authentication (`/api/auth`)

| Method | Endpoint           | Description            |
| ------ | ------------------ | ---------------------- |
| POST   | `/register`        | Register new user      |
| POST   | `/login`           | Login user             |
| POST   | `/logout`          | Logout user            |
| POST   | `/refresh`         | Refresh access token   |
| POST   | `/password/forgot` | Request password reset |
| POST   | `/password/reset`  | Reset password         |

#### Elections (`/api/elections`)

| Method | Endpoint             | Description            |
| ------ | -------------------- | ---------------------- |
| GET    | `/`                  | List elections         |
| GET    | `/:id`               | Get election details   |
| POST   | `/`                  | Create election        |
| PUT    | `/:id`               | Update election        |
| GET    | `/my-elections`      | Get user's elections   |
| GET    | `/search`            | Search elections       |
| POST   | `/:id/advance-phase` | Advance election phase |
| POST   | `/:id/start-voting`  | Start voting           |
| POST   | `/:id/close-voting`  | Close voting           |

#### Voting (`/api/votes`)

| Method | Endpoint      | Description          |
| ------ | ------------- | -------------------- |
| POST   | `/`           | Cast a vote          |
| POST   | `/validate`   | Validate secret code |
| GET    | `/`           | Get votes (Admin)    |
| GET    | `/:id`        | Get vote details     |
| POST   | `/:id/verify` | Verify vote          |

#### Results (`/api/results`)

| Method | Endpoint        | Description              |
| ------ | --------------- | ------------------------ |
| GET    | `/election/:id` | Get election results     |
| POST   | `/calculate`    | Calculate results        |
| GET    | `/verify`       | Verify results integrity |
| GET    | `/export`       | Export results (CSV/PDF) |

#### Polls (`/api/polls`)

| Method | Endpoint       | Description       |
| ------ | -------------- | ----------------- |
| GET    | `/`            | List public polls |
| GET    | `/:id`         | Get poll details  |
| POST   | `/`            | Create poll       |
| PUT    | `/:id`         | Update poll       |
| DELETE | `/:id`         | Delete poll       |
| POST   | `/:id/vote`    | Vote on poll      |
| GET    | `/:id/results` | Get poll results  |
| GET    | `/my-polls`    | Get user's polls  |

#### Users (`/api/users`)

| Method | Endpoint                       | Description                  |
| ------ | ------------------------------ | ---------------------------- |
| GET    | `/me`                          | Get current user profile     |
| PUT    | `/me`                          | Update profile               |
| PUT    | `/me/password`                 | Change password              |
| GET    | `/me/notification-preferences` | Get notification settings    |
| PUT    | `/me/notification-preferences` | Update notification settings |
| GET    | `/`                            | List users (Admin)           |
| GET    | `/:id`                         | Get user (Admin)             |
| POST   | `/`                            | Create user (Admin)          |
| PUT    | `/:id`                         | Update user (Admin)          |

#### Admin (`/api/admin`)

| Method | Endpoint              | Description       |
| ------ | --------------------- | ----------------- |
| GET    | `/dashboard`          | Admin dashboard   |
| GET    | `/statistics`         | System statistics |
| GET    | `/elections`          | All elections     |
| GET    | `/users`              | All users         |
| POST   | `/users/:id/suspend`  | Suspend user      |
| POST   | `/users/:id/activate` | Activate user     |

#### Analytics (`/api/analytics`)

| Method | Endpoint                | Description               |
| ------ | ----------------------- | ------------------------- |
| GET    | `/admin/dashboard`      | Admin analytics dashboard |
| GET    | `/admin/api-usage`      | API usage statistics      |
| GET    | `/admin/login-stats`    | Login statistics          |
| GET    | `/admin/vote-analytics` | Vote analytics            |
| GET    | `/user/dashboard`       | User analytics dashboard  |
| GET    | `/user/my-elections`    | User election analytics   |
| GET    | `/user/my-polls`        | User poll analytics       |

#### Notifications (`/api/notifications`)

| Method | Endpoint        | Description                 |
| ------ | --------------- | --------------------------- |
| GET    | `/`             | Get notifications           |
| GET    | `/unread-count` | Get unread count            |
| PUT    | `/:id/read`     | Mark as read                |
| PUT    | `/read-all`     | Mark all as read            |
| POST   | `/`             | Create notification (Admin) |

#### Bulk Operations (`/api/bulk`)

| Method | Endpoint         | Description             |
| ------ | ---------------- | ----------------------- |
| POST   | `/voters`        | Bulk register voters    |
| POST   | `/voters/import` | Import voters from CSV  |
| POST   | `/candidates`    | Bulk update candidates  |
| POST   | `/users/status`  | Bulk update user status |

#### Export (`/api/export`)

| Method | Endpoint      | Description          |
| ------ | ------------- | -------------------- |
| GET    | `/elections`  | Export elections     |
| GET    | `/voters`     | Export voters        |
| GET    | `/candidates` | Export candidates    |
| GET    | `/polls`      | Export polls         |
| GET    | `/users`      | Export users (Admin) |

### Postman Collection

Import `docs/voteapi.postman_collection.json` into Postman for API testing.

---

## Security Features

### Security Layers

1. **Network Security**

   - HTTPS/TLS encryption
   - CORS configuration
   - Security headers (Helmet)
2. **Authentication & Authorization**

   - JWT token-based authentication
   - Role-based access control (RBAC)
   - Token blacklisting
   - Session management
3. **Input Validation**

   - express-validator
   - Input sanitization
   - XSS protection
   - NoSQL injection prevention
4. **Data Protection**

   - Password hashing (bcrypt)
   - Vote encryption (AES-256-GCM)
   - Secret code hashing
   - Sensitive data redaction in logs
5. **Rate Limiting**

   - Global rate limiting (IP-based)
   - Per-user rate limiting
   - Endpoint-specific limits

### Vote Security

- **Secret Code System**: Unique codes for voter authentication
- **Vote Encryption**: End-to-end encryption
- **Duplicate Prevention**: One vote per voter per position
- **Vote Receipts**: Unique receipt hashes for verification
- **Audit Trail**: Complete voting history

---

## Deployment

### Docker Deployment

#### Quick Start

```bash
# Start development stack (includes MongoDB, Redis, MailHog)
make dev

# Or using docker-compose directly
docker-compose up -d
```

#### Development URLs

| Service       | URL                             | Description                    |
| ------------- | ------------------------------- | ------------------------------ |
| API           | http://localhost:57788          | VoteAPI Application            |
| Swagger       | http://localhost:57788/api-docs | API Documentation              |
| MongoDB Admin | http://localhost:8081           | Mongo Express (admin/admin123) |
| Redis Admin   | http://localhost:8082           | Redis Commander                |
| MailHog       | http://localhost:8025           | Email Testing UI               |

#### Docker Commands

```bash
make dev          # Start development stack
make logs         # View API logs
make shell        # Shell into API container
make db-shell     # Shell into MongoDB
make seed         # Seed database with test data
make stop         # Stop all containers
make reset        # Reset everything (deletes data)
```

#### Production Deployment

```bash
# Create production environment file
cp docker/env.production.example docker/env.production
# Edit docker/env.production with your values

# Start production stack
make prod-build

# Or using docker-compose
docker-compose -f docker-compose.prod.yml --env-file docker/env.production up -d
```

See `docker/README.md` for detailed Docker documentation.

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong JWT secrets
- [ ] Configure MongoDB Atlas or secure local MongoDB
- [ ] Enable Redis for caching
- [ ] Configure Sentry for error tracking
- [ ] Set up SSL/TLS certificates
- [ ] Configure CORS for production domains
- [ ] Set up email service (SMTP)
- [ ] Configure file storage (S3/Cloudinary)
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy

---

## Testing

### Manual Testing

Use the provided Postman collection:

1. Import `docs/voteapi.postman_collection.json`
2. Set the base URL to your server
3. Use authentication endpoints to get tokens
4. Test all endpoints

### Test Data

```bash
# Create admin users
node scripts/createAdminUsers.js

# Create test voters
node scripts/createVotersForRoles.js

# Seed database
node scripts/seedData.js
```

---

## Monitoring & Logging

### Logging

- **Application Logs**: `logs/application-YYYY-MM-DD.log`
- **Error Logs**: `logs/error-YYYY-MM-DD.log`
- **Security Logs**: `logs/security-YYYY-MM-DD.log`
- **Audit Logs**: `logs/audit.json`

### Error Tracking

Sentry integration provides:

- Real-time error tracking
- Performance monitoring
- Release tracking
- User context

### Health Check

```http
GET /health
```

Returns server health status, uptime, and system information.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Follow ESLint configuration
- Use Prettier for formatting
- Write meaningful commit messages
- Add comments for complex logic
- Update documentation

---

## License

This project is licensed under the ISC License.

---

## Support

- Open an issue on GitHub
- Check the documentation
- Review the training modules in `training/`

---

## Roadmap

- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] Mobile app SDK
- [ ] Blockchain vote verification
- [ ] GraphQL API option
- [ ] Container orchestration (Kubernetes)

---

**Built with ❤️ for transparent and secure digital elections**

**Last Updated**: December 2025 | **Version**: 1.0.0
