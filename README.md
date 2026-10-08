# Wayaz

WhatsApp-first boutique storefront for the Kenyan market. One repository, two
apps: a Django REST API (`backend/`) and a Next.js app that serves both the
storefront and the admin (`frontend/`), backed by PostgreSQL 16.

## Stack

| Layer    | Tech                                                                       |
| -------- | -------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn-style UI |
| Backend  | Django 5 + Django REST Framework + SimpleJWT, Python 3.12+ managed with `uv` |
| Database | PostgreSQL 16 via docker compose (host port 5433)                          |

## Repository layout

```text
wayaz/
├── docker-compose.yml       # PostgreSQL 16 service
├── backend/
│   ├── config/              # settings + API routing (api/v1/...)
│   ├── accounts/            # users, addresses, wishlist, JWT auth
│   ├── catalog/             # categories, products, images, reviews + admin API
│   ├── orders/              # carts, checkout, order history
│   ├── payments/            # placeholder for the M-Pesa integration
│   └── manage.py
└── frontend/
    └── src/
        ├── app/(store)/     # home, categories/[slug], products/[slug], search, orders
        ├── app/admin/       # dashboard, products CRUD, customers
        ├── components/      # store/ and admin/ UI + ui/ primitives
        └── lib/             # api client, types, query helpers, store state
```

## Features

**Storefront**

- Home, category, and search pages with filters, sorting, and pagination
- Product detail: image gallery, size selection, and stock tiers
  (`In stock`, `Only N left` up to 5, `Out of stock`)
- Guest cart kept in a server-side session id that merges into the account on
  login
- Wishlist and account via JWT login/register dialog
- Order history at `/orders`
- Product ratings and reviews (one per signed-in user, shown as star averages)
- The cart is a "Checkout coming soon" flow: checkout works at the API level,
  payment (M-Pesa) is not wired up yet

**Admin** (`/admin`)

- Dashboard: revenue trends, top products, low-stock alerts, recent orders
- Products: searchable/filterable list, create/edit forms with image upload,
  categories
- Customers list
- Header: live product search (⌘/Ctrl+K) and an orders action whose badge
  shows the pending count; the sheet lists all orders with search and status
  filters (the full orders page is coming soon)

## Backend quickstart

Prerequisites: Docker, [uv](https://docs.astral.sh/uv/), Python 3.12+.

```bash
docker compose up -d                    # PostgreSQL on localhost:5433
cd backend
uv sync                                 # creates .venv and installs deps
cp .env.example .env                    # adjust secrets if needed
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_catalog # demo catalog (jeans, shoes, shirts, ...)
.venv/bin/python manage.py seed_demo    # optional: demo images, carts, orders, wishlist
.venv/bin/python manage.py runserver    # http://127.0.0.1:8000
```

Run the backend suite:

```bash
.venv/bin/python manage.py test
```

## Frontend quickstart

Prerequisites: Node 20+.

```bash
cd frontend
npm install
printf 'NEXT_PUBLIC_API_URL=http://127.0.0.1:8000\n' > .env.local
npm run dev                             # http://localhost:3000
```

`NEXT_PUBLIC_*` values are inlined at boot, so restart `npm run dev` after
changing `.env.local`. Other scripts: `npm run build`, `npm run start`,
`npm run lint`. Quality gates: `npx tsc --noEmit`, `npx eslint src`.

## API surface (`/api/v1/`)

| Area    | Endpoints                                                                |
| ------- | ------------------------------------------------------------------------ |
| Auth    | `auth/token/`, `auth/token/refresh/`, `auth/register/`, `auth/me/`       |
| Account | `auth/addresses/`, `auth/wishlist/`                                      |
| Catalog | `catalog/categories/`, `catalog/products/`, `catalog/products/<slug>/review/` |
| Orders  | `orders/`, `orders/cart/`, `orders/cart/items/`, `orders/cart/merge/`, `orders/checkout/` |
| Admin   | `admin/overview/`, `admin/nav-counts/`, `admin/orders/`, `admin/products/`, `admin/categories/`, `admin/customers/` |

Admin endpoints require a staff/admin JWT and return 401/403 otherwise. The
guest cart is addressed by an `X-Cart-ID` header that the client persists.

## Notes and roadmap

- Next milestones: M-Pesa STK push for checkout confirmation, then the admin
  orders page that the header sheet links to.
- Stock is a simple per-product quantity; money is stored as KES decimals and
  formatted with `en-KE` in the UI.
- The `payments` app is a placeholder until the payment integration lands.
