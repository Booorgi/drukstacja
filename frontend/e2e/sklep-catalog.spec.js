const { test, expect } = require("@playwright/test");

const MOCK_PRODUCTS = [
  {
    id: "sku_brass_inserts",
    sku: "sku_brass_inserts",
    name: "Zestaw Wkładek Gwintowanych M3 / M4 (Brass Inserts 100 szt.)",
    description: "Wytrzymałe wkładki mosiężne do zgrzewania w druku 3D.",
    category: "Akcesoria DFM",
    badge: "Bestseller",
    icon: "🔩",
    price: 49,
    currency: "PLN",
    image_url: null,
    stock: 80,
    in_stock: true,
    active: true,
  },
  {
    id: "sku_pla_jet_black",
    sku: "sku_pla_jet_black",
    name: "Filament PLA Drukstacja Precision 1.75mm (1kg - Jet Black)",
    description: "Zoptymalizowany filament pod szybki druk o wysokiej precyzji.",
    category: "Filamenty",
    badge: "High Flow",
    icon: "🧵",
    price: 79,
    currency: "PLN",
    image_url: null,
    stock: 40,
    in_stock: true,
    active: true,
  },
];

test.describe("sklep catalog", () => {
  test("loads prices from API and Dodaj opens login when logged out", async ({ page }) => {
    await page.route("**/api/products", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, source: "database", products: MOCK_PRODUCTS }),
      });
    });

    await page.goto("/sklep");
    await expect(page.getByRole("heading", { name: "Gotowe komponenty, narzędzia & materiały" })).toBeVisible();
    await expect(page.locator("[data-shop-product=sku_brass_inserts]")).toContainText("49.00");
    await expect(page.locator("[data-shop-product=sku_pla_jet_black]")).toContainText("79.00");
    await expect(page.locator("[data-shop-product=sku_brass_inserts]")).toContainText("Na stanie");
    await expect(page.getByText("wkrótce", { exact: false })).toHaveCount(0);

    await page.locator("[data-shop-add=sku_brass_inserts]").click();
    await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
  });
});
