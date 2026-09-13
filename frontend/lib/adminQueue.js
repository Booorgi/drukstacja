export const POLL_MS = 20000;
export const RECENT_PAID_MS = 30 * 60 * 1000;
export const SEEN_STORAGE_KEY = "drukstacja_admin_seen_checkout_ids";

export const STATUS_LABEL = {
  pending_payment: "Oczekuje wpłaty",
  in_queue: "W kolejce",
  in_production: "W druku",
  post_processing: "QC",
  shipped: "Wysłane",
};

export const NEXT_STATUS = {
  in_queue: "in_production",
  in_production: "post_processing",
  post_processing: "shipped",
};

export const NEXT_ACTION_LABEL = {
  in_production: "Przekaż do druku",
  post_processing: "Przekaż do QC",
  shipped: "Oznacz jako wysłane",
};

export const FILTERS = [
  { key: "all", label: "Wszystkie" },
  { key: "in_queue", label: "W kolejce" },
  { key: "in_production", label: "W druku" },
  { key: "post_processing", label: "QC" },
  { key: "shipped", label: "Wysłane" },
  { key: "pending_payment", label: "Oczekuje wpłaty" },
];

const PRODUCTION_RANK = {
  in_queue: 0,
  in_production: 1,
  post_processing: 2,
  pending_payment: 3,
  shipped: 4,
};

export function checkoutMatchesQuery(checkout, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  const haystacks = [
    checkout?.id,
    checkout?.customer_email,
    checkout?.shipping_name,
    checkout?.shipping_phone,
    checkout?.company,
    checkout?.nip,
  ];
  for (const line of checkout?.lines || []) {
    haystacks.push(line?.id, line?.file_name, line?.material, line?.layer_height);
  }
  return haystacks.some((value) => String(value || "").toLowerCase().includes(needle));
}

export function emptyAdminCounts() {
  return {
    all: 0,
    in_queue: 0,
    in_production: 0,
    post_processing: 0,
    shipped: 0,
    pending_payment: 0,
    paid: 0,
    pending: 0,
  };
}

export function countAdminCheckouts(checkouts) {
  const counts = emptyAdminCounts();
  for (const row of checkouts || []) {
    const production = row.production_status;
    const payment = row.payment_status;
    if (["in_queue", "in_production", "post_processing", "shipped"].includes(production)) {
      counts.all += 1;
      if (counts[production] != null) counts[production] += 1;
    }
    if (production === "pending_payment" || payment === "pending") {
      counts.pending_payment += 1;
    }
    if (payment === "paid") counts.paid += 1;
    if (payment === "pending") counts.pending += 1;
  }
  return counts;
}

function createdTs(row) {
  const value = row?.created_at;
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

export function sortAdminCheckouts(checkouts) {
  return [...(checkouts || [])].sort((a, b) => {
    const rankA = PRODUCTION_RANK[a.production_status] ?? 9;
    const rankB = PRODUCTION_RANK[b.production_status] ?? 9;
    if (rankA !== rankB) return rankA - rankB;
    return createdTs(b) - createdTs(a);
  });
}

export function filterAdminCheckouts(checkouts, { status = "all", query = "" } = {}) {
  const matched = (checkouts || []).filter((row) => checkoutMatchesQuery(row, query));
  if (status === "pending_payment") {
    return sortAdminCheckouts(
      matched.filter(
        (row) => row.production_status === "pending_payment" || row.payment_status === "pending"
      )
    );
  }
  if (status && status !== "all") {
    return sortAdminCheckouts(matched.filter((row) => row.production_status === status));
  }
  return sortAdminCheckouts(
    matched.filter((row) =>
      ["in_queue", "in_production", "post_processing", "shipped"].includes(row.production_status)
    )
  );
}

export function isRecentlyPaid(checkout, now = Date.now()) {
  if (checkout?.payment_status !== "paid") return false;
  const stamp = Date.parse(checkout.updated_at || checkout.created_at || "");
  if (!Number.isFinite(stamp)) return false;
  return now - stamp <= RECENT_PAID_MS;
}

export function isUnreadNew(checkout, seenIds) {
  if (checkout?.production_status !== "in_queue") return false;
  if (checkout?.payment_status !== "paid") return false;
  return !seenIds?.has(String(checkout.id));
}

export function loadSeenIds() {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = JSON.parse(window.localStorage.getItem(SEEN_STORAGE_KEY) || "[]");
    return new Set((Array.isArray(raw) ? raw : []).map(String));
  } catch {
    return new Set();
  }
}

export function saveSeenIds(ids) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...ids]));
}

export function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

export function formatWhen(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function lineCountLabel(lines) {
  const n = (lines || []).length;
  if (n === 1) return "1 pozycja";
  if (n >= 2 && n <= 4) return `${n} pozycje`;
  return `${n} pozycji`;
}

export function shippingSummary(checkout) {
  const city = [checkout?.shipping_postal_code, checkout?.shipping_city].filter(Boolean).join(" ");
  return [checkout?.shipping_name, city].filter(Boolean).join(" · ");
}

export function paymentLabel(status) {
  switch (status) {
    case "paid":
      return "Opłacone";
    case "pending":
      return "Oczekuje wpłaty";
    case "cancelled":
      return "Anulowane";
    case "failed":
      return "Płatność nieudana";
    default:
      return status || "Płatność";
  }
}
