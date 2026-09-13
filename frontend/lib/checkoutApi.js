import { authHeaders } from "./ordersApi";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function apiBase() {
  return String(API_URL || "").replace(/\/$/, "");
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

export async function createCheckout(address) {
  const res = await fetch(`${apiBase()}/api/checkout`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(address),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return res.json();
}

export async function cancelCheckout(checkoutId) {
  const res = await fetch(`${apiBase()}/api/checkout/cancel`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(checkoutId ? { checkout_id: checkoutId } : {}),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return res.json();
}

export async function getCheckout(checkoutId) {
  const res = await fetch(`${apiBase()}/api/checkout/${encodeURIComponent(checkoutId)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = await res.json();
  return data.checkout;
}

export async function listAdminCheckouts(status) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`${apiBase()}/api/admin/checkouts${qs}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const error = new Error(await readApiError(res));
    error.status = res.status;
    throw error;
  }
  const data = await res.json();
  return data.checkouts || [];
}

export async function advanceAdminCheckout(checkoutId, productionStatus) {
  const res = await fetch(`${apiBase()}/api/admin/checkouts/${encodeURIComponent(checkoutId)}`, {
    method: "PATCH",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ production_status: productionStatus }),
  });
  if (!res.ok) {
    const error = new Error(await readApiError(res));
    error.status = res.status;
    throw error;
  }
  const data = await res.json();
  return data.checkout;
}

export function productionFileHref(url) {
  if (!url) return null;
  if (String(url).startsWith("http")) return url;
  return `${apiBase()}${url}`;
}
