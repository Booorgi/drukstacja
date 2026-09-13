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

export async function listProducts(options = {}) {
  const params = new URLSearchParams();
  if (options.category) params.set("category", options.category);
  const qs = params.toString();
  const res = await fetch(`${apiBase()}/api/products${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = await res.json();
  return {
    products: data.products || [],
    categories: data.categories || [],
    source: data.source || null,
    category: data.category ?? null,
  };
}

export async function addProductToCart(productId, quantity = 1) {
  const res = await fetch(`${apiBase()}/api/products/${encodeURIComponent(productId)}/cart`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ quantity }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = await res.json();
  return data.order;
}
