# mini-e2b

A monorepo project for building and managing sandbox environments with support for Docker and Firecracker executors.

## 🏗️ Project Structure

This Turborepo monorepo includes:

### Apps
- **`apps/server`**: Express.js backend with Prisma ORM and PostgreSQL database
- **`apps/web`**: React frontend built with Vite, TypeScript, and Tailwind CSS

### Packages
- **`packages/ui`**: Shared React component library
- **`packages/eslint-config`**: Shared ESLint configurations
- **`packages/typescript-config`**: Shared TypeScript configurations

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9.0.0 (package manager)
- **PostgreSQL** database
- **Docker** (required for running sandboxes)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mini-e2b
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables** (see [Environment Variables](#-environment-variables) section below)

4. **Set up the database**
   ```bash
   cd apps/server
   pnpm db:migrate   # Run database migrations
   pnpm db:generate  # Generate Prisma client
   ```

5. **Start development servers**
   ```bash
   # From the root directory
   pnpm dev
   ```

   This will start:
   - Backend server at `http://localhost:3000`
   - Frontend app at `http://localhost:5173`

## 🔐 Environment Variables

### Root Environment Variables

Create a `.env` file in the root directory:

```env
# Root .env (used for both apps)
DATABASE_URL="postgresql://username:password@localhost:5432/sandbox_db?schema=public"
FRONTEND_URL="http://localhost:5173"
PORT="3000"
VITE_API_BASE_URL="http://localhost:3000"
EXECUTOR="docker"
```

### Server Environment Variables

Create a `.env` file in `apps/server/`:

```env
PORT=3000
FRONTEND_URL=http://localhost:5173
DATABASE_URL="postgresql://username:password@localhost:5432/sandbox_db?schema=public"
# Executor type: "docker" or "firecracker" firecracker only works on linux
EXECUTOR="docker"
```

### Web Environment Variables

Create a `.env` file in `apps/web/`:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3000
```

## 🔧 Configuration Details

### Environment Variable Reference

| Variable | Location | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | server | PostgreSQL connection string | Required |
| `PORT` | server | Server port | `3000` |
| `FRONTEND_URL` | server | Frontend URL for CORS | `http://localhost:5173` |
| `VITE_API_BASE_URL` | web | Backend API URL | `http://localhost:3000` |
| `EXECUTOR` | server | Executor type (`docker` or `firecracker`) | `docker` |

### Database Setup

1. **Local PostgreSQL**
   ```bash
   # Install PostgreSQL (macOS)
   brew install postgresql
   brew services start postgresql
   
   # Create database
   createdb sandbox_db
   ```

2. **Using Neon (Cloud PostgreSQL)**
   - Sign up at [neon.tech](https://neon.tech)
   - Create a new project
   - Copy the connection string to `DATABASE_URL`

3. **Run migrations**
   ```bash
   cd apps/server
   pnpm db:migrate
   ```

## 📝 Available Scripts

### Root Level

```bash
# Development
pnpm dev              # Start all apps in development mode

# Build
pnpm build            # Build all apps and packages

# Code Quality
pnpm lint             # Lint all packages
pnpm format           # Format code with Prettier
pnpm check-types      # Type-check all packages
```

### Server Scripts

```bash
cd apps/server

pnpm dev              # Start server with nodemon
pnpm build            # Build server
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run database migrations
pnpm db:push          # Push schema changes to database
pnpm db:studio        # Open Prisma Studio
```

### Web Scripts

```bash
cd apps/web

pnpm dev              # Start Vite dev server
pnpm build            # Build for production
pnpm preview          # Preview production build
pnpm lint             # Run ESLint
```

## 🏃 Running Individual Apps

You can run specific apps using Turbo filters:

```bash
# Run only the server
turbo dev --filter=server

# Run only the web app
turbo dev --filter=web

# Run both apps
turbo dev
```

## 🧪 Development Workflow

1. **Database Changes**
   ```bash
   cd apps/server
   # Edit prisma/schema.prisma
   pnpm db:migrate    # Create and apply migration
   ```

2. **Adding Dependencies**
   ```bash
   # Root dependency (shared across apps)
   pnpm add -w <package>
   
   # App-specific dependency
   pnpm --filter server add <package>
   pnpm --filter web add <package>
   ```

## 🐳 Docker Support

This project uses Docker for sandbox execution. Make sure Docker is running:

```bash
# Check Docker status
docker ps

# If not running, start Docker Desktop
# (macOS: open Docker Desktop app)
```

## 📚 Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, React Router
- **Backend**: Express.js, TypeScript, Prisma, Dockerode
- **Database**: PostgreSQL
- **Monorepo**: Turborepo
- **Package Manager**: pnpm

## 🚨 Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready

# Connect to database to verify credentials
psql -d sandbox_db
```

### Port Already in Use

Change the `PORT` in your `.env` files if port 3000 or 5173 are already in use.

### Prisma Client Errors

```bash
cd apps/server
pnpm db:generate
```

### Build Errors

```bash
# Clean and reinstall
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

## 📄 License

ISC

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
