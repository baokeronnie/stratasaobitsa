# Strata Sa'o Bitsa — Online Ordering

An ordering site for Strata Sa'o Bitsa ("Come Get Hooked") — fried, boiled,
and smoked fish with sides, across two branches (Francistown and Gaborone
West / G-West), with WhatsApp-confirmed orders, bank-transfer payment with
proof-of-payment upload, and a staff dashboard to verify payments and manage
the order queue.

## Running locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Deploying to GitHub Pages (automatic)

This repo already includes a GitHub Actions workflow
(`.github/workflows/deploy.yml`) that builds and publishes the site every
time you push to `main`.

1. Create a new GitHub repository and push this project to it:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. On GitHub, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push again (or re-run the workflow from the **Actions** tab) if it
   doesn't trigger automatically.
5. After the workflow finishes (green check under **Actions**), your site
   will be live at:
   ```
   https://<your-username>.github.io/<your-repo>/
   ```

No build step or config changes are needed for a project-style GitHub
Pages URL — `vite.config.js` already uses a relative base path.

## Staff dashboard

Click **"Staff Portal"** at the bottom of the site and enter the PIN
`1234` to access the kitchen dashboard: view incoming orders, check
customer details, view proof-of-payment images, approve/reject payments,
and move orders through Preparing → Ready → Completed.

**Change this PIN** (`ADMIN_PIN` near the top of `src/App.jsx`) before
sharing the live link publicly — it's a simple prototype gate, not real
authentication.

## Before taking real orders, update these placeholders in `src/App.jsx`:

- `BANK_DETAILS` — replace with your real bank name, account number, and
  branch code. These are currently placeholder values.
- `STAFF_ALERT_EMAIL` — the email address that gets a pre-filled "new
  order" email draft opened for staff to send.
- `LOCATIONS` — branch names, landmarks, directions, and phone numbers.
- Side prices in `SIDES_DATA` — the business's fish prices are accurate
  (from their Facebook posts), but side prices were placeholders.

## Important limitation: no shared backend

This app currently stores all data (menu, orders, proof-of-payment
images) in the browser's `localStorage` (see `src/storage.js`), because
GitHub Pages only serves static files — there's no database behind it.

This means:

- Data only exists in **one browser, on one device**. It's great for a
  live demo/presentation on a single laptop or phone.
- If you open the customer site on your phone and the staff dashboard on
  your laptop, **they will not see the same orders** — each device has
  its own separate local storage.

**For real, multi-device use** (customers ordering from their own phones
while staff manage orders from a shop laptop), you'll need a real backend
— for example [Firebase Firestore](https://firebase.google.com/docs/firestore)
or [Supabase](https://supabase.com/), both of which have free tiers and
can be swapped in by replacing the functions in `src/storage.js` while
keeping the same `get/set/delete/list` shape the rest of the app expects.
