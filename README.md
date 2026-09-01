# Strata Sa'o Bitsa — Online Ordering

An ordering site for Strata Sa'o Bitsa ("Come Get Hooked") — fried, boiled,
and smoked fish with sides, across two branches (Francistown and Gaborone
West / G-West), with WhatsApp-confirmed orders, bank-transfer payment with
proof-of-payment upload, real-time order updates over WebSockets, and staff
accounts with individually assignable permissions.

This project has two parts:

- **`/`** (this folder) — the customer/staff-facing website (React + Vite).
- **`/server`** — a small backend (Node + Express + Socket.IO) that stores
  the menu, orders, and staff accounts, and pushes live updates to
  everyone connected.

The website **cannot run on its own** — it talks to `/server` for
everything (menu, placing orders, logins, etc.), so the backend needs to
be running (locally or deployed) before the site will work.

## 1. Set up a database

This backend stores everything (menu, orders, staff accounts, proof-of-payment
images) in Postgres, so you need a Postgres database before it will start.

The easiest free option is **[Neon](https://neon.tech)** (serverless Postgres,
generous free tier, no expiry):

1. Sign up at neon.tech, create a new project.
2. On the project dashboard, copy the **connection string** (looks like
   `postgresql://user:password@ep-xxxx.aws.neon.tech/dbname?sslmode=require`).

Render Postgres or Supabase work too — anywhere you can get a Postgres
connection string.

## 2. Run the backend

```bash
cd server
npm install
cp .env.example .env   # then open .env and set JWT_SECRET and DATABASE_URL
npm run dev
```

You should see:

```
Seeded the database with a fresh admin account:
  username: admin
  password: ChangeMe123!
  IMPORTANT: log in and change this password immediately.
Strata Sa'o Bitsa server listening on port 4000
```

That's your first login — **change this password immediately** (tap
**Change Password** in the staff dashboard header after logging in — see
"Staff accounts" below). Data lives in Postgres from here on, so it
survives restarts and redeploys — no local file to lose.

Already have a local `server/data.json` from an earlier version of this
project that you want to keep? Run `npm run migrate-local-data` once
(after setting `DATABASE_URL`) to copy it into Postgres.

## 3. Run the website

In a separate terminal, from the project root:

```bash
npm install
cp .env.example .env   # defaults to http://localhost:4000, matching the backend above
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The site will
connect to the backend you started in step 1 — menu items, orders, and
the staff dashboard should all work, and changes made in one browser tab
appear instantly in others (that's the WebSocket connection at work).

## Deploying so you can share a live link

Because there are two parts, you deploy them to two different places:

### Backend → Render (or Railway / Fly.io)

GitHub Pages and Vercel's static hosting **cannot run this backend** —
they only serve files, not a persistent server or WebSocket connection.
[Render](https://render.com) has a free tier that works well:

1. Push this whole project to a GitHub repository.
2. On Render, click **New → Web Service**, connect your repo.
3. Set **Root Directory** to `server`.
4. Build command: `npm install` — Start command: `npm start`.
5. Add environment variables:
   - `JWT_SECRET` — a long random string
     (generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   - `DATABASE_URL` — your Postgres connection string from step 1 above (Neon,
     Render Postgres, Supabase, etc.).
6. Deploy. You'll get a URL like `https://strata-server.onrender.com`.

Note: Render's free tier "spins down" after inactivity, so the first
request after a while takes a few extra seconds to wake back up — normal
and fine for a small restaurant's order volume. Because data now lives in
Postgres rather than on Render's local disk, this spin-down/wake-up cycle
no longer risks losing any data — the free web service tier is fine to use
long-term for this project.

### Frontend → GitHub Pages or Vercel

Once your backend is deployed and you have its URL:

1. Set `VITE_API_URL` to your backend's URL — either in a `.env` file
   (for local builds) or as an environment variable in your hosting
   provider's dashboard (recommended for deployment).

**GitHub Pages:** This repo includes a GitHub Actions workflow
(`.github/workflows/deploy.yml`) that builds and publishes automatically
on every push to `main`. Add `VITE_API_URL` as a repository secret
(**Settings → Secrets and variables → Actions**) and reference it in the
workflow's build step, or commit a `.env` file with your backend URL
directly if you're not worried about it being public (it's just a URL,
not a secret).

Then: **Settings → Pages → Source: GitHub Actions**, push, and your site
goes live at `https://<your-username>.github.io/<your-repo>/`.

**Vercel:** Import the repo at [vercel.com](https://vercel.com), leave
the default Vite build settings, add `VITE_API_URL` under **Environment
Variables** in the project settings, and deploy. You'll get a URL like
`https://your-repo.vercel.app`.

Every future push auto-redeploys both.

## Staff accounts & permissions

Staff log in with a real username and password (tap **Staff Portal** at
the bottom of the site) — this replaces the earlier PIN-based prototype
gate with real authentication (hashed passwords, signed sessions).

The seeded **admin** account can create additional staff accounts and
assign each one individual permissions:

- **Manage order queue & statuses** — move orders through Preparing →
  Ready → Completed
- **Approve/reject proof of payment** — review payment screenshots and
  confirm or reject them
- **Edit menu & availability** — mark items sold out, edit the menu
- **Manage staff accounts** — create/edit/remove other staff logins
  (this is what makes someone an "admin" in practice)

Admins automatically have every permission. Staff only see and can act on
the sections their permissions allow — for example, someone without
"Manage staff accounts" won't see the "Manage Staff" tab at all.

**Change the seed admin password** as soon as you deploy — log in, then
tap **Change Password** in the dashboard header (top right, next to
Refresh and Log out).

## Real-time updates (WebSockets)

The site connects to the backend over Socket.IO (WebSockets). This means:

- When a customer places an order, it appears on every logged-in staff
  member's dashboard **instantly** — no refreshing or polling delay.
- When staff approve a payment or update an order's status, the
  customer's own order-tracking page updates live too.
- Menu changes (like marking something sold out) show up immediately for
  anyone browsing the menu.

A manual **Refresh** button remains in a few places as a fallback in case
a push is ever missed (e.g. a brief network hiccup), but it's not needed
for normal use.

## Customer order tracking

Customers track orders by "logging in" with the WhatsApp number they used
when ordering (tap **My Orders**) — this looks up their orders from the
backend by that number, and they get live updates via the same WebSocket
connection.

## Proof of payment

On the payment step, customers tap **"Attach Proof of Payment"**, which
opens a dialog with instructions and a clearly-labeled upload area. They
preview the image before confirming with **"Use This Photo"**. Staff with
the "Approve/reject proof of payment" permission review these photos in
the dashboard before approving.

## Before taking real orders, update these placeholders in `src/App.jsx`:

- `BANK_DETAILS` — replace with your real bank name, account number, and
  branch code.
- `STAFF_ALERT_EMAIL` — the email address that gets a pre-filled "new
  order" email draft opened for staff to send.
- `LOCATIONS` — branch names, landmarks, directions, and phone numbers
  (also used as the WhatsApp number order alerts are sent to).
- Side prices in `SIDES_DATA` — the business's fish prices are accurate
  (from their Facebook posts), but side prices were placeholders.

And in `server/`:

- Change the seed admin password immediately after first deploying.
- Set a real, random `JWT_SECRET` (never leave the default in production).
- Set `DATABASE_URL` to your production Postgres connection string.

## Mobile & device compatibility

The layout is fully responsive (phones, tablets, desktop) — the menu
grid, checkout form, and admin dashboard all reflow at smaller widths,
and the header navigation stays fully usable on small screens via icons.
A global style reset removes default browser margins and sets the page
background to match the app's theme (rather than white), so there's no
flash of white background or blank strip at the edges while the page
loads or when scrolling bounces on mobile.

## Scaling beyond one restaurant

The backend stores everything as a single JSON document in Postgres (see
the `app_state` table in `server/index.js`), which is simple and completely
fine for one or two branches' worth of daily orders. If this grows
significantly (many staff, high order volume, long-term analytics), split
that JSON document into proper relational tables (`users`, `menu_items`,
`orders`, etc.) — the route handlers and Socket.IO events don't need to
change much, just the `loadData`/`save` functions and the queries inside
each route.
