# Wayaz E-Commerce Platform

A modern e-commerce web application featuring a headless Django backend and modern reactive frontend.

---

## Architecture Overview

- **Database**: PostgreSQL 16 (running via Docker)
- **Backend**: Django 5.x + Django REST Framework + CORS Headers (`backend/`)
- **Package & Environment Manager**: `uv`

```text
wayaz/
├── docker-compose.yml       # PostgreSQL 16 service
├── .gitignore               # Ignores .venv, .env, plan docs, etc.
├── README.md                # Quickstart guide
├── backend/
│   ├── pyproject.toml       # uv configuration & dependencies
│   ├── requirements.txt     # Pinned Python dependencies
│   ├── .env.example         # Environment template
│   ├── .env                 # Local environment variables (untracked)
│   ├── manage.py            # Django management script
│   ├── config/              # Core Django settings & routing
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── accounts/            # Users, customers, authentication
│   ├── catalog/             # Products, categories, brands, variants
│   ├── orders/              # Orders, order items, checkout
│   └── payments/            # Payment transactions
```

---

## Getting Started

### 1. Prerequisites
- [Docker](https://www.docker.com/) and Docker Compose
- [uv](https://github.com/astral-sh/uv) (Python package manager)
- Python 3.13+

### 2. Start PostgreSQL Database
```bash
docker compose up -d
```
This spins up the PostgreSQL 16 container (`wayaz_db`) with database `wayaz` on host port `5433`.

### 3. Backend Setup
Navigate into the `backend/` directory:
```bash
cd backend
```

Ensure `.env` matches your local setup:
```bash
cp .env.example .env
```

Install dependencies and run database migrations:
```bash
uv pip install -r requirements.txt
uv run python manage.py migrate
```

Start the development server:
```bash
uv run python manage.py runserver
```
The API and Django Admin will be accessible at:
- Admin Panel: `http://127.0.0.1:8000/admin/`
