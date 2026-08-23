// storage.js
//
// This app was originally built for Claude.ai's built-in `window.storage`
// API (a hosted key-value store). GitHub Pages is a plain static file host
// with no backend, so there is no server-side database to call.
//
// This file polyfills the SAME `window.storage.get/set/delete/list`
// interface using the browser's localStorage, so the rest of the app
// (App.jsx) does not need to change at all.
//
// IMPORTANT LIMITATION:
// localStorage is scoped to one browser on one device. That means:
//   - A customer's cart/order history only exists in their own browser.
//   - Orders placed by a customer will NOT automatically appear in the
//     staff dashboard unless it's opened in the SAME browser on the SAME
//     device (e.g. you're just demoing/presenting on one laptop).
//   - Two different customers, or a customer and staff on separate
//     phones/computers, will NOT see each other's data.
//
// This is fine for a live demo/presentation on a single device. For a real
// multi-device deployment where customers and staff use different phones,
// you'll need a real backend (e.g. Firebase Firestore, Supabase, or a small
// custom API) in place of this file — the get/set/delete/list function
// signatures below are exactly what you'd swap out.

const ns = (key, shared) => `strata:${shared ? "shared" : "personal"}:${key}`;

const storagePolyfill = {
  async get(key, shared) {
    try {
      const raw = window.localStorage.getItem(ns(key, shared));
      if (raw === null) return null;
      return { key, value: raw, shared: !!shared };
    } catch (e) {
      return null;
    }
  },

  async set(key, value, shared) {
    try {
      window.localStorage.setItem(ns(key, shared), value);
      return { key, value, shared: !!shared };
    } catch (e) {
      return null;
    }
  },

  async delete(key, shared) {
    try {
      window.localStorage.removeItem(ns(key, shared));
      return { key, deleted: true, shared: !!shared };
    } catch (e) {
      return null;
    }
  },

  async list(prefix = "", shared) {
    try {
      const fullPrefix = ns(prefix, shared);
      const emptyPrefix = ns("", shared);
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(fullPrefix)) keys.push(k.slice(emptyPrefix.length));
      }
      return { keys, prefix, shared: !!shared };
    } catch (e) {
      return null;
    }
  },
};

if (typeof window !== "undefined") {
  window.storage = storagePolyfill;
}

export default storagePolyfill;
