# EventBuilder AI - Quick Start Guide

## 30-Second Setup

### 1. Prepare Environment
```bash
cp .env.example .env.local
# Edit .env.local and add your GEMINI_API_KEY
```

### 2. Start Docker
```bash
docker-compose up --build
```

### 3. Access App
Open http://localhost:8080 in your browser

That's it! 🎉

---

## What's Running

| Component | URL | Details |
|-----------|-----|---------|
| **Main App** | http://localhost:8080 | Event management interface |
| **Admin Panel** | http://localhost:8080/#/admin | Settings & configuration |
| **API Health** | http://localhost:8080/api/health | Health check endpoint |

---

## Essential Commands

```bash
# Start production
docker-compose up --build

# Start development (with hot reload)
docker-compose --profile dev up --build eventbuilder-dev

# Stop
docker-compose down

# View logs
docker-compose logs -f

# Access shell
docker exec -it eventbuilder-app sh

# Using the helper script (interactive menu)
./docker-commands.sh

# Or direct commands
./docker-commands.sh start      # Start production
./docker-commands.sh dev        # Start dev
./docker-commands.sh stop       # Stop
./docker-commands.sh logs       # View logs
./docker-commands.sh health     # Check health
```

---

## First-Time Setup Checklist

- [ ] Clone repository
- [ ] Copy `.env.example` to `.env.local`
- [ ] Add `GEMINI_API_KEY` to `.env.local`
- [ ] Run `docker-compose up --build`
- [ ] Open http://localhost:8080
- [ ] Navigate to Admin Panel (#/admin)
- [ ] Configure any optional services (SMTP, BigMarker, Zoom, etc.)

---

## API Keys You Might Need

| Service | Purpose | Get Key At |
|---------|---------|-----------|
| **Gemini** | AI event generation | https://aistudio.google.com/app/apikey |
| **BigMarker** | Event hosting | https://bigmarker.com/settings/api |
| **Zoom** | Video conferencing | https://marketplace.zoom.us/ |
| **Vimeo** | Video hosting | https://developer.vimeo.com/ |

---

## Troubleshooting

### Port 8080 Already in Use
```bash
# Change port in docker-compose.yml
# Change "8080:8080" to "8081:8080"
docker-compose up --build
# Then use http://localhost:8081
```

### Container Won't Start
```bash
# Check logs
docker-compose logs eventbuilder

# Rebuild from scratch
docker-compose down -v
docker-compose up --build
```

### Database Issues
```bash
# Clear database (fresh start)
docker-compose down -v
docker-compose up --build
```

---

## Next Steps

1. **Read Full Guide**: See `DOCKER_SETUP.md` for detailed documentation
2. **Configure Services**: Use Admin Panel to set up integrations
3. **Create Events**: Start building your first event
4. **Deploy**: Deploy to cloud when ready (see DOCKER_SETUP.md)

---

## Files Overview

| File | Purpose |
|------|---------|
| `Dockerfile` | Production image |
| `Dockerfile.dev` | Development image with hot reload |
| `docker-compose.yml` | Service orchestration |
| `.env.example` | Environment variables template |
| `DOCKER_SETUP.md` | Complete documentation |
| `docker-commands.sh` | Helper script for common tasks |
| `QUICKSTART.md` | This file |

---

## Architecture

```
┌─────────────────────────────────────┐
│     EventBuilder AI Application     │
├─────────────────────────────────────┤
│  Frontend (React + Vite)            │
│  - Dashboard                        │
│  - Event Management                 │
│  - Admin Panel                      │
├─────────────────────────────────────┤
│  Backend (Express.js)               │
│  - API Routes                       │
│  - Admin Config                     │
│  - Email Service                    │
│  - API Proxies                      │
├─────────────────────────────────────┤
│  Data Layer (JSON Database)         │
│  - Events                           │
│  - Configuration                    │
│  - Registrants                      │
└─────────────────────────────────────┘
```

---

## Features

✅ **Event Management** - Create, edit, delete events
✅ **User Registration** - Collect registrations
✅ **Email Integration** - Send confirmation emails
✅ **API Integrations** - BigMarker, Zoom, Vimeo support
✅ **AI Generation** - Google Gemini-powered features
✅ **Admin Dashboard** - Configure everything via UI
✅ **Data Security** - AES-256 encryption for sensitive data
✅ **Docker Ready** - Production-ready containerization

---

## Need Help?

- 📖 Full Guide: `DOCKER_SETUP.md`
- 🔧 Commands: `./docker-commands.sh`
- 🐛 Logs: `docker-compose logs -f`
- ❤️ Support: Open an issue on GitHub

---

**Ready to build some events? Let's go! 🚀**
