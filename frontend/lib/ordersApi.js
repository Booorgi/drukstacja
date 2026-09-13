import { supabase } from "./supabaseClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function apiBase() {
  return String(API_URL || "").replace(/\/$/, "");
}

export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

export async function authHeaders(extra = {}) {
  const token = await getAccessToken();
  const headers = { ...extra };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function readApiError(res) {
  try {
    const body = await res.json();
    return body?.detail || body?.error || body?.message || res.statusText;
  } catch {
    try {
      const text = await res.text();
      return text || res.statusText;
    } catch {
      return res.statusText || "request_failed";
    }
  }
}

export function hideDeletedCartItems(items) {
  if (!Array.isArray(items)) return [];
  if (typeof window === "undefined") return items;
  try {
    const deletedIds = JSON.parse(localStorage.getItem("deleted_order_ids") || "[]");
    return items.filter((item) => !deletedIds.includes(String(item.id)));
  } catch {
    return items;
  }
}

export async function listOrders({ status } = {}) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`${apiBase()}/api/orders${qs}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = await res.json();
  return data.orders || [];
}

export async function fetchCartOrders() {
  const items = await listOrders({ status: "in_cart" });
  return hideDeletedCartItems(items);
}

export async function createOrder(payload) {
  const res = await fetch(`${apiBase()}/api/orders`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = await res.json();
  return data.order;
}

export async function createRfqOrder(payload) {
  const res = await fetch(`${apiBase()}/api/orders/rfq`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = await res.json();
  return data.order;
}

export async function cancelOrder(orderId) {
  if (!orderId) return null;
  const res = await fetch(`${apiBase()}/api/orders/${orderId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(await readApiError(res));
  }
  try {
    return await res.json();
  } catch {
    return { success: true };
  }
}

export async function clearCart() {
  const res = await fetch(`${apiBase()}/api/orders/clear-cart`, {
    method: "POST",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return res.json();
}
