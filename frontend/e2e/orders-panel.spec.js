const { test, expect } = require("@playwright/test");

const MOCK_PRINT_ORDER = {
  id: "e0bc50ac-aaaa-bbbb-cccc-dddddddddddd",
  file_name: "Watchcase 1.stl",
  status: "in_queue",
  created_at: "2026-09-13T21:09:00.000Z",
  total_price: 35.7,
  technology: "FDM Precision 0.4mm",
  material: "PLA Tough / Standard",
  layer_height: "0.2 mm",
  infill: 20,
  quantity: 15,
  dimensions_mm: [45.03, 47.55, 13.62],
  clean_supports: true,
  brass_inserts: false,
  nozzle_size: "0.4",
  production_file_url: null,
};

const MOCK_SHOP_ORDER = {
  id: "shop-line-001",
  file_name: "Zestaw wkładek M3",
  status: "in_queue",
  created_at: "2026-09-12T10:00:00.000Z",
  total_price: 49,
  technology: "shop_sku",
  material: "hardware",
  layer_height: "sku_brass_inserts",
  infill: 0,
  quantity: 1,
};

function fakeJwt(email) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "user-orders-1",
      email,
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: "authenticated",
      role: "authenticated",
    })
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

function mockSession(email = "test@drukstacja.pl") {
  const accessToken = fakeJwt(email);
  return {
    access_token: accessToken,
    refresh_token: "refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-orders-1",
      email,
      aud: "authenticated",
      role: "authenticated",
    },
  };
}

async function mockAuthSession(page, session = mockSession()) {
  await page.addInitScript((value) => {
    window.localStorage.setItem("sb-placeholder-auth-token", JSON.stringify(value));
  }, session);

  await page.route("https://placeholder.supabase.co/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/user") || url.includes("/auth/v1/session")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(session.user),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

async function mockOrdersApi(page, orders) {
  await page.route("**/api/orders**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const url = new URL(route.request().url());
    const status = url.searchParams.get("status");
    const payload = status === "in_cart" ? [] : orders;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ orders: payload }),
    });
  });
}

test.describe("orders panel", () => {
  test("logged-out visitors see storefront login prompt instead of lab chrome", async ({ page }) => {
    await page.goto("/orders");

    await expect(page.getByRole("heading", { name: "Moje zlecenia" })).toBeVisible();
    await expect(page.locator("[data-site-nav]")).toBeVisible();
    await expect(page.locator("[data-orders-login]")).toContainText("Zaloguj się, aby zobaczyć zlecenia");
    await expect(page.locator("h1")).toHaveText("Moje zlecenia");
    await expect(page.getByText("LABS 3D")).toHaveCount(0);
    await expect(page.getByText("Wróć do konfiguratora")).toHaveCount(0);
    await expect(page.locator("header a", { hasText: "DRUKSTACJA" })).toHaveCount(0);

    await page.locator("[data-orders-login] button").click();
    await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
  });

  test("print and shop lines keep status, params, price and 3MF download", async ({ page }) => {
    await mockAuthSession(page);
    await mockOrdersApi(page, [MOCK_PRINT_ORDER, MOCK_SHOP_ORDER]);

    await page.goto("/orders");

    await expect(page.getByRole("heading", { name: "Moje zlecenia" })).toBeVisible();
    await expect(page.getByText("Zleceń:")).toContainText("2");

    const printCard = page.locator("[data-order-card=e0bc50ac-aaaa-bbbb-cccc-dddddddddddd]");
    await expect(printCard).toHaveAttribute("data-order-kind", "print");
    await expect(printCard).toContainText("Watchcase 1.stl");
    await expect(printCard).toContainText("35.70");
    await expect(printCard).toContainText("W kolejce farmy");
    await expect(printCard).toContainText("Stan realizacji w farmie druku:");
    await expect(printCard.locator("[data-order-step-state=current]")).toContainText("1. Zlecone / Kolejka");
    await expect(printCard).toContainText("FDM Precision 0.4mm");
    await expect(printCard).toContainText("PLA Tough / Standard");
    await expect(printCard).toContainText("0.2 mm");
    await expect(printCard).toContainText("20%");
    await expect(printCard).toContainText("15 szt.");
    await expect(printCard).toContainText("45.03×47.55×13.62");
    await expect(printCard).toContainText("Usunięcie podpór roboczych");
    await expect(printCard.locator("[data-order-download-3mf]")).toBeVisible();
    await expect(printCard.locator("[data-order-download-3mf]")).toHaveAttribute(
      "href",
      /download-3mf/
    );

    const shopCard = page.locator("[data-order-card=shop-line-001]");
    await expect(shopCard).toHaveAttribute("data-order-kind", "shop");
    await expect(shopCard).toContainText("Sklep");
    await expect(shopCard).toContainText("Produkt sklepowy");
    await expect(shopCard).toContainText("Hardware");
    await expect(shopCard).toContainText("sku_brass_inserts");
    await expect(shopCard).toContainText("49.00");
    await expect(shopCard.locator("[data-order-download-3mf]")).toHaveCount(0);
    await expect(shopCard).not.toContainText("Stan realizacji w farmie druku:");
  });

  test("empty account uses storefront empty state", async ({ page }) => {
    await mockAuthSession(page);
    await mockOrdersApi(page, []);

    await page.goto("/orders");

    await expect(page.locator("[data-orders-empty]")).toContainText("Brak zarejestrowanych zleceń");
    await expect(page.getByRole("link", { name: "Przejdź do wyceniarki" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "Zobacz sklep" })).toHaveAttribute("href", "/sklep");
  });
});
