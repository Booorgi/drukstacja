const { test, expect } = require("@playwright/test");

const NOW = new Date().toISOString();
const HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const CHECKOUTS = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    customer_email: "jan@example.com",
    shipping_name: "Jan Kowalski",
    shipping_phone: "500600700",
    shipping_street: "Testowa 1",
    shipping_city: "Warszawa",
    shipping_postal_code: "00-001",
    shipping_country: "PL",
    company: "Booorgi Sp. z o.o.",
    nip: "5252345678",
    payment_status: "paid",
    production_status: "in_queue",
    created_at: NOW,
    updated_at: NOW,
    total: 42.5,
    shipping: 0,
    lines: [
      {
        id: "line-cube",
        file_name: "cube.stl",
        material: "PLA (Czysta Biel)",
        quantity: 2,
        total_price: 42.5,
        technology: "FDM",
      },
    ],
  },
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
    customer_email: "anna@drukstacja.pl",
    shipping_name: "Anna Nowak",
    shipping_phone: "501501501",
    shipping_street: "Fabryczna 8",
    shipping_city: "Kraków",
    shipping_postal_code: "30-001",
    shipping_country: "PL",
    payment_status: "paid",
    production_status: "in_production",
    created_at: HOUR_AGO,
    updated_at: HOUR_AGO,
    total: 79,
    shipping: 0,
    lines: [
      {
        id: "line-bracket",
        file_name: "bracket.stl",
        material: "PET-G Czarny",
        quantity: 1,
        total_price: 79,
        technology: "FDM",
      },
    ],
  },
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
    customer_email: "qc@example.com",
    shipping_name: "Piotr QC",
    shipping_phone: "502502502",
    shipping_street: "QC 3",
    shipping_city: "Gdańsk",
    shipping_postal_code: "80-001",
    shipping_country: "PL",
    payment_status: "paid",
    production_status: "post_processing",
    created_at: HOUR_AGO,
    updated_at: HOUR_AGO,
    total: 35,
    shipping: 0,
    lines: [
      {
        id: "line-qc",
        file_name: "keychain.3mf",
        material: "PLA",
        quantity: 1,
        total_price: 35,
        technology: "FDM",
      },
    ],
  },
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4",
    customer_email: "done@example.com",
    shipping_name: "Marta Wysłane",
    shipping_phone: "503503503",
    shipping_street: "Portowa 2",
    shipping_city: "Gdynia",
    shipping_postal_code: "81-001",
    shipping_country: "PL",
    payment_status: "paid",
    production_status: "shipped",
    created_at: HOUR_AGO,
    updated_at: HOUR_AGO,
    total: 120,
    shipping: 0,
    lines: [
      {
        id: "line-ship",
        file_name: "housing.stl",
        material: "ASA",
        quantity: 1,
        total_price: 120,
        technology: "FDM",
      },
    ],
  },
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5",
    customer_email: "nowy@example.com",
    shipping_name: "Nowy Klient",
    shipping_phone: "504504504",
    shipping_street: "Nowa 9",
    shipping_city: "Poznań",
    shipping_postal_code: "60-001",
    shipping_country: "PL",
    payment_status: "pending",
    production_status: "pending_payment",
    created_at: NOW,
    updated_at: NOW,
    total: 49,
    shipping: 0,
    lines: [
      {
        id: "line-shop",
        file_name: "Zestaw Wkładek Gwintowanych M3 / M4",
        material: "hardware",
        quantity: 1,
        total_price: 49,
        technology: "shop_sku",
        layer_height: "sku_brass_inserts",
      },
    ],
  },
];

function adminSession() {
  return {
    access_token: "e2e-admin-token",
    refresh_token: "e2e-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "admin@drukstacja.pl",
      aud: "authenticated",
      role: "authenticated",
    },
  };
}

async function mockAdminApi(page, rows = CHECKOUTS) {
  await page.route("**/api/admin/checkouts**", async (route) => {
    if (route.request().method() === "PATCH") {
      const url = new URL(route.request().url());
      const id = url.pathname.split("/").pop();
      const body = route.request().postDataJSON() || {};
      const current = rows.find((row) => row.id === id);
      const updated = {
        ...current,
        production_status: body.production_status,
        lines: (current?.lines || []).map((line) => ({
          ...line,
          status: body.production_status,
        })),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, checkout: updated }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        checkouts: rows,
        counts: {
          all: 4,
          in_queue: 1,
          in_production: 1,
          post_processing: 1,
          shipped: 1,
          pending_payment: 1,
        },
        admin: "admin@drukstacja.pl",
      }),
    });
  });

  await page.route("**/api/orders**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, orders: [] }),
    });
  });
}

async function openAdmin(page) {
  await page.addInitScript((session) => {
    window.localStorage.setItem("sb-placeholder-auth-token", JSON.stringify(session));
    window.localStorage.removeItem("drukstacja_admin_seen_checkout_ids");
  }, adminSession());
  await mockAdminApi(page);
  await page.goto("/admin");
}

test.describe("admin queue", () => {
  test("filters, search and new-order highlight", async ({ page }) => {
    await openAdmin(page);

    await expect(page.getByRole("heading", { name: "Kolejka produkcji" })).toBeVisible();
    await expect(page.locator("[data-admin-checkout]")).toHaveCount(4);
    await expect(page.locator("[data-admin-checkout=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1]")).toContainText("Nowe");
    await expect(page.locator("[data-admin-checkout=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1]")).toContainText("cube.stl");
    await expect(page.locator("[data-admin-new-count]")).toContainText("nowe w kolejce");

    await page.locator("[data-admin-filter=in_production]").click();
    await expect(page.locator("[data-admin-checkout]")).toHaveCount(1);
    await expect(page.locator("[data-admin-checkout]")).toContainText("bracket.stl");

    await page.locator("[data-admin-filter=pending_payment]").click();
    await expect(page.locator("[data-admin-checkout]")).toHaveCount(1);
    await expect(page.locator("[data-admin-checkout]")).toContainText("Wkładek");
    await expect(page.locator("[data-admin-checkout]")).toContainText("Oczekuje wpłaty");

    await page.locator("[data-admin-filter=all]").click();
    await page.locator("[data-admin-search]").fill("jan@example.com");
    await expect(page.locator("[data-admin-checkout]")).toHaveCount(1);
    await expect(page.locator("[data-admin-checkout]")).toContainText("Jan Kowalski");

    await page.locator("[data-admin-search]").fill("aaa1");
    await expect(page.locator("[data-admin-checkout]")).toHaveCount(1);

    await page.locator("[data-admin-search]").fill("");
    await page.locator("[data-admin-mark-seen]").click();
    await expect(page.locator("[data-admin-new-badge]")).toHaveCount(0);
    await expect(page.locator("[data-admin-new-count]")).toHaveCount(0);
  });

  test("advances queue status from the card action", async ({ page }) => {
    await openAdmin(page);
    await expect(page.getByRole("button", { name: "Przekaż do druku" })).toBeVisible();
    await page.getByRole("button", { name: "Przekaż do druku" }).click();
    await expect(page.locator("[data-admin-checkout=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1]")).toContainText("W druku");
  });

  test("is usable on a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAdmin(page);
    await expect(page.locator("[data-admin-search]")).toBeVisible();
    await expect(page.locator("[data-admin-filter=in_queue]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Przekaż do druku" })).toBeVisible();
    await page.locator("[data-admin-filter=shipped]").click();
    await expect(page.locator("[data-admin-checkout]")).toContainText("housing.stl");
  });
});
