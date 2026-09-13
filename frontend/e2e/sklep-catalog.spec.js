const { test, expect } = require("@playwright/test");

const MOCK_PRODUCTS = [
  {
    id: "sku_brass_inserts",
    sku: "sku_brass_inserts",
    name: "Zestaw Wkładek Gwintowanych M3 / M4 (Brass Inserts 100 szt.)",
    description: "Wytrzymałe wkładki mosiężne do zgrzewania w druku 3D.",
    category: "hardware",
    category_label: "Hardware",
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
    category: "materialy",
    category_label: "Materiały",
    badge: "High Flow",
    icon: "🧵",
    price: 79,
    currency: "PLN",
    image_url: null,
    stock: 40,
    in_stock: true,
    active: true,
  },
  {
    id: "sku_magigoo_original",
    sku: "sku_magigoo_original",
    name: "Klej adhezyjny Magigoo 3D (Original 50ml)",
    description: "Profesjonalny podkład zapobiegający odklejaniu wydruków.",
    category: "materialy",
    category_label: "Materiały",
    badge: "Pro",
    icon: "🧪",
    price: 65,
    currency: "PLN",
    image_url: null,
    stock: 25,
    in_stock: true,
    active: true,
  },
  {
    id: "sku_deburring_tool",
    sku: "sku_deburring_tool",
    name: "Precyzyjny nożyk deburring tool do obróbki krawędzi",
    description: "Ostrze obrotowe do szybkiego usuwania gratu z tworzywa.",
    category: "narzedzia",
    category_label: "Narzędzia",
    badge: "Niezbędnik",
    icon: "🔪",
    price: 35,
    currency: "PLN",
    image_url: null,
    stock: 60,
    in_stock: true,
    active: true,
  },
];

const MOCK_CATEGORIES = [
  { slug: "materialy", label: "Materiały", hint: "filament, kleje (Magigoo), spraye, taśmy", count: 2 },
  { slug: "hardware", label: "Hardware", hint: "wkładki mosiężne, śruby, magnesy", count: 1 },
  { slug: "narzedzia", label: "Narzędzia", hint: "gratowniki, szczypce i obróbka", count: 1 },
  { slug: "gotowe-printy", label: "Gotowe printy", hint: "zabawki użytkowe", count: 0 },
  { slug: "akcesoria", label: "Akcesoria", hint: "stoły, dysze, organizery", count: 0 },
];

async function mockCatalog(page) {
  await page.route("**/api/products**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const url = new URL(route.request().url());
    const category = url.searchParams.get("category");
    const products = category
      ? MOCK_PRODUCTS.filter((item) => item.category === category)
      : MOCK_PRODUCTS;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        source: "database",
        category: category || null,
        products,
        categories: MOCK_CATEGORIES,
      }),
    });
  });
}

test.describe("sklep catalog", () => {
  test("loads prices from API and Dodaj opens login when logged out", async ({ page }) => {
    await mockCatalog(page);

    await page.goto("/sklep");
    await expect(page.getByRole("heading", { name: "Gotowe komponenty, narzędzia & materiały" })).toBeVisible();
    await expect(page.locator("[data-shop-product=sku_brass_inserts]")).toContainText("49.00");
    await expect(page.locator("[data-shop-product=sku_pla_jet_black]")).toContainText("79.00");
    await expect(page.locator("[data-shop-product=sku_brass_inserts]")).toContainText("Na stanie");
    await expect(page.locator("[data-shop-product=sku_brass_inserts]")).toContainText("Hardware");
    await expect(page.locator("[data-shop-product=sku_brass_inserts]")).toContainText("Bestseller");
    await expect(page.getByText("wkrótce", { exact: false })).toHaveCount(0);

    await page.locator("[data-shop-add=sku_brass_inserts]").click();
    await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
  });

  test("category chips filter catalog and show empty Gotowe printy", async ({ page }) => {
    await mockCatalog(page);
    await page.goto("/sklep");

    await expect(page.locator("[data-shop-category=all]")).toBeVisible();
    await expect(page.locator("[data-shop-category=materialy]")).toContainText("Materiały");
    await expect(page.locator("[data-shop-category=gotowe-printy]")).toContainText("Gotowe printy");

    await page.locator("[data-shop-category=hardware]").click();
    await expect(page).toHaveURL(/kategoria=hardware/);
    await expect(page.locator("[data-shop-product]")).toHaveCount(1);
    await expect(page.locator("[data-shop-product=sku_brass_inserts]")).toBeVisible();
    await expect(page.locator("[data-shop-product=sku_pla_jet_black]")).toHaveCount(0);

    await page.locator("[data-shop-category=materialy]").click();
    await expect(page.locator("[data-shop-product]")).toHaveCount(2);
    await expect(page.locator("[data-shop-product=sku_pla_jet_black]")).toBeVisible();
    await expect(page.locator("[data-shop-product=sku_magigoo_original]")).toBeVisible();

    await page.locator("[data-shop-category=gotowe-printy]").click();
    await expect(page).toHaveURL(/kategoria=gotowe-printy/);
    await expect(page.locator("[data-shop-product]")).toHaveCount(0);
    await expect(page.locator("[data-shop-empty-category=gotowe-printy]")).toContainText("zabawek użytkowych");
    await expect(page.getByText("Litofany", { exact: false })).toBeVisible();

    await page.locator("[data-shop-category=all]").click();
    await expect(page.locator("[data-shop-product]")).toHaveCount(4);
  });
});
