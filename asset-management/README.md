# AssetFlow

**Enterprise IT Asset Management** — track, manage, and optimize your organization's entire hardware and software fleet from a single, unified platform.

AssetFlow is a Next.js dashboard UI for IT asset management: laptops and devices, accessories, software licenses, purchase orders, assignments, repairs, and more — with the people, locations, and vendors that tie them all together.

> **Note:** Login/auth (`/`, `/forgot-password`) is backed by a real Django REST API in `../asset_backend` — see [Backend Setup](#backend-setup) below. It requires an account that actually exists in *your own* local database; it does not accept arbitrary input. Other modules (assets, purchase orders, etc.) still run on in-memory mock data seeded on load — refreshing the app resets any changes made there during a session.

## Backend Setup

Each developer must run their own isolated backend — **never** copy another developer's `db.sqlite3` or `.env` file; each contains that person's real accounts, password hashes, and SMTP credentials.

```bash
cd ../asset_backend
python -m venv venv && venv\Scripts\activate   # (or source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
copy .env.example .env      # (or: cp .env.example .env)
# then edit .env and fill in your own DJANGO_SECRET_KEY and Gmail SMTP app password
python manage.py migrate
python manage.py runserver
```

Then register your own account through the app's normal sign-up flow before logging in.

## Modules

**Inventory**
- All Assets — laptops, desktops, monitors, mobile devices, networking gear, peripherals
- Catalog — Categories, Brands, and Models shared across the app

**Organization**
- Organization (people directory), Workplaces, Vendors

**Operations**
- Purchase Orders
- Assignments
- Service — Returns, Maintenance, Repairs, and Software Licenses in one tabbed view
- Accessories — stock levels, reorder thresholds, condition/status tracking

**Insights**
- Reports — trend and breakdown charts with export
- Audit Logs — activity history log

**Other**
- Notifications

Settings, Roles & Permissions, Profile, Help Center, and Support are on the roadmap and currently show a "Coming soon" placeholder.

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev)
- TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [lucide-react](https://lucide.dev) for icons

## Getting Started

Install dependencies, then run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app. `/` is the login screen (any input is accepted — there's no real auth backend); the dashboard lives under `/dashboard`.

Other useful scripts:

```bash
npm run build   # production build
npm run start   # run the production build
npm run lint    # eslint
```

## Project Structure

```
src/
  app/
    page.tsx            # login screen ("/")
    dashboard/
      layout.tsx        # sidebar + topbar shell
      <module>/page.tsx # one route per module
      [...slug]/        # catch-all "Coming soon" placeholder for unbuilt routes
  components/
    <module>/
      data.ts           # types, mock data generators, helpers
      context.tsx        # React context provider for that module's state
      table.tsx           # main list view, filters, add/edit form
      grid.tsx             # card-based list view (used instead of table.tsx by some modules)
      detail-modal.tsx    # detail view + actions (where applicable)
    dashboard/          # sidebar, topbar, stat cards, theme toggle
    auth/               # login / forgot-password forms
    brand/              # logo, hero illustration
    providers.tsx       # nests every module's context provider
  lib/
    nav.ts              # sidebar navigation config
    utils.ts
```

Each module under `src/components/` is self-contained and wired into the app via `src/components/providers.tsx`, which nests every module's context provider around the dashboard layout. A few modules deviate from the standard file set by design: **Reports** has no `context.tsx`/`table.tsx` of its own — it derives everything live from the Assets/Departments/Categories contexts (`report-view.tsx` plus chart components) so it can't drift out of sync with the data it's reporting on. **Returns** likewise has no `context.tsx`, building directly on the Assignments/Assets contexts as its single source of truth. **Audit Logs** uses `log-view.tsx` in place of `table.tsx`/`detail-modal.tsx`, and **Notifications** uses `list.tsx`. **Categories**, **Brands**, and **Departments** use `grid.tsx` (a card-based list view) instead of `table.tsx`.

**Organization (people directory)** and **Catalog** are thin `tabs.tsx` wrappers with no `data.ts`/`context.tsx`/list view of their own — they just tab-switch between other modules' components (Organization: Employees + Departments; Catalog: Categories + Brands + Models) and add a shared Cards/Table view-mode toggle that gets passed down as a prop. Employees and Departments accept that `viewMode` prop to render either their card grid or an equivalent table layout; Categories, Brands, and Models do the same for the Catalog tabs.

**Service** is also a thin `tabs.tsx` wrapper, tab-switching between the existing Returns, Maintenance, Repairs, and Software Licenses table components — those modules keep their own `context.tsx`/`table.tsx` and remain reachable directly (e.g. `/dashboard/maintenance`), Service just gives them a single sidebar entry with no Cards/Table toggle.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
