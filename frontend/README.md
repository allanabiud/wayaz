# Wayaz frontend

Next.js 16 storefront (`/`) and admin (`/admin`) for the Wayaz Django API.
See the [root README](../README.md) for the full stack, backend setup, and
API surface.

## Setup

```bash
npm install
printf 'NEXT_PUBLIC_API_URL=http://127.0.0.1:8000\n' > .env.local
npm run dev
```

The backend must be running first (see the root README). `NEXT_PUBLIC_*`
values are inlined at boot, so restart `npm run dev` after changing
`.env.local`.

## Scripts

- `npm run dev` - dev server on http://localhost:3000 (Turbopack)
- `npm run build` - production build
- `npm run start` - serve the production build
- `npm run lint` - ESLint over `src/`

Quality gates before committing: `npx tsc --noEmit`, `npx eslint src`,
`npm run build`.

## Structure

```text
src/
├── app/
│   ├── (store)/        # home, categories/[slug], products/[slug], search, orders
│   ├── admin/          # dashboard, products (list, new, [id], [id]/edit), customers
│   └── login/          # standalone login page
├── components/
│   ├── store/          # storefront: header, footer, cart/wishlist sheets, product views
│   ├── admin/          # admin header/sidebar, product form, image manager, tables
│   └── ui/             # shadcn-style primitives
└── lib/                # api client (JWT + X-Cart-ID), types, query helpers, store context
```

## Notes

- The cart sheet is a "Checkout coming soon" flow: the checkout endpoint
  exists, but payment is not wired up yet.
- Admin data lives behind staff-only endpoints; the header and pages render
  once the API confirms the role.
- Stock tiers are surfaced as `In stock`, `Only N left` (up to 5), and
  `Out of stock`.
