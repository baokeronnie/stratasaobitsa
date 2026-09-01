// server/index.js
//
// Small backend for Strata Sa'o Bitsa's ordering site.
//
// Responsibilities:
//  - Stores menu, orders, proof-of-payment images, and staff user accounts
//    in Postgres (as a single JSON document — simple and fine for one
//    restaurant's order volume; see the "app_state" table below). For much
//    heavier traffic you'd eventually split this into real relational
//    tables, but the route handlers below wouldn't need to change either
//    way — only loadData()/save() would.
//  - Real username/password login for staff, with roles + granular
//    permissions (manageMenu, manageOrders, approvePayments, manageUsers).
//  - Broadcasts order/menu changes over Socket.IO so customers and staff
//    see updates instantly, without polling.
//
// Deploy this folder to a host that supports long-running Node processes
// (Render, Railway, Fly.io) — NOT GitHub Pages or Vercel's static hosting,
// which only serve files and can't run a persistent server or WebSocket.
//
// Requires a DATABASE_URL environment variable pointing at a Postgres
// database (e.g. from Neon, Render Postgres, or Supabase). See
// server/.env.example.

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import pg from "pg";

const { Pool } = pg;

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me-in-production";
const PORT = process.env.PORT || 4000;

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable. Set it to your Postgres connection string.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Most hosted Postgres providers (Neon, Render, Supabase) require SSL and
  // use certificates that Node won't automatically trust — this is the
  // standard way to allow that without needing custom CA setup.
  ssl: { rejectUnauthorized: false },
});

const DEFAULT_MENU = [
  { id: "f1", category: "fried", name: "Fried Fish", desc: "Fresh fish deep-fried to order, golden and crisp. Choose your size.", sizes: [{ label: "Small", price: 75 }, { label: "Medium", price: 100 }, { label: "Large", price: 120 }, { label: "X-Large", price: 150 }, { label: "Whole / Family", price: 200 }], soldOut: false },
  { id: "b1", category: "boiled", name: "Boiled Fish", desc: "Whole fish gently simmered until soft and flaky. Choose your size.", sizes: [{ label: "Small", price: 75 }, { label: "Medium", price: 100 }, { label: "Large", price: 120 }, { label: "X-Large", price: 150 }, { label: "Whole / Family", price: 200 }], soldOut: false },
  { id: "s1", category: "smoked", name: "Smoked Fish", desc: "Slow-smoked over open coals for a deep, woody flavour. Choose your size.", sizes: [{ label: "Small", price: 75 }, { label: "Medium", price: 100 }, { label: "Large", price: 120 }, { label: "X-Large", price: 150 }, { label: "Whole / Family", price: 200 }], soldOut: false },
  { id: "sd1", category: "sides", name: "Salsa", desc: "Fresh tomato and onion relish.", price: 15, soldOut: false },
  { id: "sd2", category: "sides", name: "Fried Rice", desc: "Lightly spiced fried rice.", price: 25, soldOut: false },
  { id: "sd3", category: "sides", name: "Bogobe jwa Lerotse", desc: "Sorghum porridge cooked with sweet melon.", price: 18, soldOut: false },
  { id: "sd4", category: "sides", name: "Mabele", desc: "Traditional sorghum porridge.", price: 15, soldOut: false },
  { id: "sd5", category: "sides", name: "Lephutshe", desc: "Pumpkin mashed with maize meal.", price: 15, soldOut: false },
  { id: "dr1", category: "drinks", name: "Soft Drink (330ml)", desc: "Ice-cold can.", price: 12, soldOut: false },
  { id: "dr2", category: "drinks", name: "Bottled Water (500ml)", desc: "Still water.", price: 8, soldOut: false },
];

const ALL_PERMISSIONS = ["manageMenu", "manageOrders", "approvePayments", "manageUsers"];
const DEFAULT_ADMIN_PASSWORD = "ChangeMe123!";

/* ---------------------------------- data store ---------------------------------- */
//
// Everything (users, menu, orders, proofs) lives as one JSON document in a
// single-row Postgres table. This keeps the in-memory `db` object and every
// route handler below identical to the old file-based version — only these
// two functions talk to Postgres.

async function loadData() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query("SELECT data FROM app_state WHERE id = 1");
  if (rows.length > 0) return rows[0].data;

  const seedAdmin = {
    id: nanoid(),
    username: "admin",
    passwordHash: bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10),
    role: "admin",
    permissions: { manageMenu: true, manageOrders: true, approvePayments: true, manageUsers: true },
    createdAt: new Date().toISOString(),
  };
  const seed = { users: [seedAdmin], menu: DEFAULT_MENU, orders: [], proofs: {} };
  await pool.query("INSERT INTO app_state (id, data) VALUES (1, $1)", [JSON.stringify(seed)]);
  console.log("Seeded the database with a fresh admin account:");
  console.log(`  username: admin`);
  console.log(`  password: ${DEFAULT_ADMIN_PASSWORD}`);
  console.log("  IMPORTANT: log in and change this password immediately.");
  return seed;
}

let db;
async function save() {
  await pool.query("UPDATE app_state SET data = $1, updated_at = now() WHERE id = 1", [JSON.stringify(db)]);
}

const normPhone = (s) => (s || "").replace(/\s+/g, "").replace(/^0/, "").replace(/^\+?267/, "");

// Wraps an async route handler so a thrown/rejected error reaches Express's
// error handler instead of crashing the request silently.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------------------------------- app setup ---------------------------------- */

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" })); // proof-of-payment images travel as base64 in JSON

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("join", ({ room }) => {
    if (typeof room === "string" && room.length < 100) socket.join(room);
  });
});

/* ---------------------------------- auth helpers ---------------------------------- */

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, permissions: user.permissions },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Session expired, please log in again." });
  }
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (req.user.role === "admin" || req.user.permissions?.[perm]) return next();
    return res.status(403).json({ error: "You don't have permission to do that." });
  };
}

/* ---------------------------------- auth routes ---------------------------------- */

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = db.users.find((u) => u.username.toLowerCase() === String(username || "").toLowerCase());
  if (!user || !bcrypt.compareSync(password || "", user.passwordHash)) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }
  const token = signToken(user);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions } });
});

app.post("/api/change-password", requireAuth, ah(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (!bcrypt.compareSync(currentPassword || "", user.passwordHash)) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  await save();
  res.json({ ok: true });
}));

/* ---------------------------------- user management ---------------------------------- */

const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, permissions: u.permissions, createdAt: u.createdAt });

app.get("/api/users", requireAuth, requirePermission("manageUsers"), (req, res) => {
  res.json(db.users.map(publicUser));
});

app.post("/api/users", requireAuth, requirePermission("manageUsers"), ah(async (req, res) => {
  const { username, password, role, permissions } = req.body || {};
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: "Username and a password (8+ characters) are required." });
  }
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "That username is already taken." });
  }
  const perms = {};
  ALL_PERMISSIONS.forEach((p) => { perms[p] = !!(permissions && permissions[p]); });
  const user = {
    id: nanoid(),
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role: role === "admin" ? "admin" : "staff",
    permissions: perms,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  await save();
  res.status(201).json(publicUser(user));
}));

app.patch("/api/users/:id", requireAuth, requirePermission("manageUsers"), ah(async (req, res) => {
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  const { role, permissions, password, active } = req.body || {};
  if (role) user.role = role === "admin" ? "admin" : "staff";
  if (permissions) {
    ALL_PERMISSIONS.forEach((p) => { user.permissions[p] = !!permissions[p]; });
  }
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    user.passwordHash = bcrypt.hashSync(password, 10);
  }
  if (typeof active === "boolean") user.active = active;
  await save();
  res.json(publicUser(user));
}));

app.delete("/api/users/:id", requireAuth, requirePermission("manageUsers"), ah(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account while logged in." });
  }
  const admins = db.users.filter((u) => u.role === "admin");
  const target = db.users.find((u) => u.id === req.params.id);
  if (target?.role === "admin" && admins.length <= 1) {
    return res.status(400).json({ error: "Can't delete the last remaining admin account." });
  }
  db.users = db.users.filter((u) => u.id !== req.params.id);
  await save();
  res.json({ ok: true });
}));

/* ---------------------------------- menu ---------------------------------- */

app.get("/api/menu", (req, res) => {
  res.json(db.menu);
});

app.put("/api/menu", requireAuth, requirePermission("manageMenu"), ah(async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: "Menu must be an array." });

  const isFiniteNonNegative = (n) => typeof n === "number" && isFinite(n) && n >= 0;

  for (const item of req.body) {
    if (!item || typeof item !== "object" || !item.id || typeof item.name !== "string" || !item.name.trim() || !item.category) {
      return res.status(400).json({ error: "Each menu item needs an id, a non-empty name, and a category." });
    }
    if (item.sizes) {
      if (!Array.isArray(item.sizes) || item.sizes.length === 0) {
        return res.status(400).json({ error: `"${item.name}" has an invalid sizes list.` });
      }
      for (const s of item.sizes) {
        if (!s || typeof s.label !== "string" || !isFiniteNonNegative(s.price)) {
          return res.status(400).json({ error: `"${item.name}" has an invalid price for one of its sizes.` });
        }
        if (s.soldOut !== undefined && typeof s.soldOut !== "boolean") {
          return res.status(400).json({ error: `"${item.name}" has an invalid sold-out flag for one of its sizes.` });
        }
      }
    } else if (!isFiniteNonNegative(item.price)) {
      return res.status(400).json({ error: `"${item.name}" has an invalid price.` });
    }
  }

  db.menu = req.body;
  await save();
  io.emit("menu:updated", db.menu);
  res.json(db.menu);
}));

/* ---------------------------------- orders ---------------------------------- */

app.get("/api/orders", requireAuth, (req, res) => {
  res.json(db.orders);
});

app.get("/api/orders/mine", (req, res) => {
  const whatsapp = normPhone(req.query.whatsapp);
  if (!whatsapp) return res.status(400).json({ error: "whatsapp query param required." });
  res.json(db.orders.filter((o) => normPhone(o.customer.whatsapp) === whatsapp));
});

app.get("/api/orders/:id/proof", requireAuth, (req, res) => {
  const dataUrl = db.proofs[req.params.id];
  if (!dataUrl) return res.status(404).json({ error: "No proof found for this order." });
  res.json({ dataUrl });
});

app.post("/api/orders", ah(async (req, res) => {
  const { order, proofDataUrl } = req.body || {};
  if (!order || !order.id) return res.status(400).json({ error: "Invalid order payload." });
  db.orders.push(order);
  if (proofDataUrl) db.proofs[order.id] = proofDataUrl;
  await save();

  io.to("staff").emit("order:new", order);
  io.to(`customer:${normPhone(order.customer.whatsapp)}`).emit("order:new", order);

  res.status(201).json(order);
}));

app.patch("/api/orders/:id/status", requireAuth, requirePermission("manageOrders"), ah(async (req, res) => {
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  order.status = req.body.status;
  await save();
  io.to("staff").emit("order:updated", order);
  io.to(`customer:${normPhone(order.customer.whatsapp)}`).emit("order:updated", order);
  res.json(order);
}));

app.patch("/api/orders/:id/payment", requireAuth, requirePermission("approvePayments"), ah(async (req, res) => {
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  const { paymentStatus } = req.body;
  order.paymentStatus = paymentStatus;
  if (paymentStatus === "Approved" && order.status === "Awaiting Verification") order.status = "Order Placed";
  if (paymentStatus === "Rejected") order.status = "Awaiting Verification";
  await save();
  io.to("staff").emit("order:updated", order);
  io.to(`customer:${normPhone(order.customer.whatsapp)}`).emit("order:updated", order);
  res.json(order);
}));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Centralized error handler — catches anything thrown/rejected in an
// ah(...)-wrapped route (most commonly a database hiccup) so a bad request
// or transient DB error returns a clean 500 instead of hanging or crashing.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on our end. Please try again." });
});

async function start() {
  db = await loadData();
  httpServer.listen(PORT, () => {
    console.log(`Strata Sa'o Bitsa server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

