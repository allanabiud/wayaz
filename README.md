# Wayaz

WhatsApp-first boutique storefront for the Kenyan market. One repository, two
apps: a Django REST API (`backend/`) and a Next.js app that serves both the
storefront and the admin (`frontend/`), backed by MariaDB/MySQL.

## Stack

| Layer    | Tech                                                                       |
| -------- | -------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn-style UI |
| Backend  | Django 5 + Django REST Framework + SimpleJWT, Python 3.12+ managed with `uv` |
| Database | MariaDB 11.4 via docker compose (host port 3306)                            |

## Repository layout

```text
wayaz/
├── docker-compose.yml       # MariaDB 11.4 service
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
docker compose up -d                    # MariaDB on localhost:3306
cd backend
uv sync                                 # creates .venv and installs deps
cp .env.example .env                    # adjust secrets if needed
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_catalog # demo catalog (jeans, shoes, shirts, ...)
.venv/bin/python manage.py seed_demo    # optional: product images from examples/
.venv/bin/python manage.py seed_shop    # optional: customers, orders, carts, reviews
.venv/bin/python manage.py runserver    # http://127.0.0.1:8000
```

`seed_demo` rebuilds the catalog from product images (and clears any carts,
orders, and wishlist rows); `seed_shop` layers demo shop activity on top of
that catalog without touching products. Run it after `seed_demo`. It creates
20 demo customers (login `amina.wanjiku` / `wayaz1234`, password shared
across all demo customers) with addresses, ~90 days of backdated orders,
active carts, wishlist saves, and product reviews, so the admin dashboard
and analytics charts have data to plot. It also creates a demo admin
(`admin` / `admin1234`) if no superuser exists yet. Re-running is safe:
only rows belonging to `@wayaz.demo` accounts and `guest-demo-` checkouts
are replaced, so real accounts and their orders are left alone. Options:
`--customers`, `--max-orders`, `--seed`, `--password`, `--admin-password`,
`--skip-admin`.

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

Interactive API documentation (drf-spectacular) is served by the backend:

- Swagger UI: `/api/v1/schema/swagger-ui/`
- ReDoc: `/api/v1/schema/redoc/`
- Raw OpenAPI 3 document: `/api/v1/schema/`

CI regenerates and validates the schema on every push
(`manage.py spectacular --validate`), so the spec never drifts from the code.
The uptime-monitor health probes (`/api/health/`, `/health`) are excluded
from the spec on purpose — they are operational plumbing, not API surface.

## Notes and roadmap

- Next milestones: M-Pesa STK push for checkout confirmation, then the admin
  orders page that the header sheet links to.
- Stock is a simple per-product quantity; money is stored as KES decimals and
  formatted with `en-KE` in the UI.
- The `payments` app is a placeholder until the payment integration lands.
