// src/api.js
//
// Talks to the backend in server/. Set VITE_API_URL (see .env.example) to
// your deployed backend's URL before building the frontend.

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch (e) { /* empty response */ }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (username, password) => request("/api/login", { method: "POST", body: { username, password } }),
  changePassword: (token, currentPassword, newPassword) =>
    request("/api/change-password", { method: "POST", token, body: { currentPassword, newPassword } }),

  listUsers: (token) => request("/api/users", { token }),
  createUser: (token, user) => request("/api/users", { method: "POST", token, body: user }),
  updateUser: (token, id, patch) => request(`/api/users/${id}`, { method: "PATCH", token, body: patch }),
  deleteUser: (token, id) => request(`/api/users/${id}`, { method: "DELETE", token }),

  getMenu: () => request("/api/menu"),
  putMenu: (token, menu) => request("/api/menu", { method: "PUT", token, body: menu }),

  getAllOrders: (token) => request("/api/orders", { token }),
  getMyOrders: (whatsapp) => request(`/api/orders/mine?whatsapp=${encodeURIComponent(whatsapp)}`),
  getProof: (token, orderId) => request(`/api/orders/${orderId}/proof`, { token }),
  placeOrder: (order, proofDataUrl) => request("/api/orders", { method: "POST", body: { order, proofDataUrl } }),
  setOrderStatus: (token, orderId, status) =>
    request(`/api/orders/${orderId}/status`, { method: "PATCH", token, body: { status } }),
  setPaymentStatus: (token, orderId, paymentStatus) =>
    request(`/api/orders/${orderId}/payment`, { method: "PATCH", token, body: { paymentStatus } }),
};
