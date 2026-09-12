const { test, expect } = require("@playwright/test");

test.describe("breloki studio UX (#19)", () => {
  test("Kształt: export is secondary and cart is in the viewport", async ({ page }) => {
    await page.goto("/breloki");

    await expect(page.getByRole("heading", { name: "Płaskorzeźba Hexagon" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kształt" })).toBeVisible();

    await expect(page.getByRole("button", { name: /^STL$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^\.3MF$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Warstwy$/ })).toHaveCount(0);

    const quoteBar = page.locator("[data-keychain-quote-bar]");
    await expect(quoteBar).toBeVisible();
    await expect(quoteBar.getByText("Razem")).toBeVisible();
    await expect(quoteBar.getByRole("button", { name: "Do koszyka" })).toBeVisible();

    await page.getByRole("button", { name: "Eksport i widok warstw" }).click();
    await expect(page.getByRole("menuitem", { name: /Widok warstw/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Pobierz STL/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Pobierz projekt AMS/ })).toBeVisible();
  });

  test("Grafika: AMS layers start as compact swatches", async ({ page }) => {
    await page.goto("/breloki");
    await page.getByRole("button", { name: "Grafika" }).click();

    await expect(page.locator("[data-ams-swatches]")).toBeVisible();
    await expect(page.locator("[data-ams-layer-details]")).toHaveCount(0);
    await expect(page.getByText("Kolor grafiki 1")).toHaveCount(0);

    await page.locator("[data-ams-expand]").click();
    await expect(page.locator("[data-ams-layer-details]")).toBeVisible();
    await expect(page.getByText("Kolor grafiki 1")).toBeVisible();
  });

  test("Tekst: typography appears after content is entered", async ({ page }) => {
    await page.goto("/breloki");
    await page.getByRole("button", { name: "Tekst" }).click();

    const input = page.getByPlaceholder("Wpisz tekst (np. imię)...");
    await expect(input).toBeVisible();
    await expect(page.locator("[data-text-style-controls]")).toHaveCount(0);
    await expect(page.getByText("Font")).toHaveCount(0);

    await input.fill("Ada");
    await expect(page.locator("[data-text-style-controls]")).toBeVisible();
    await expect(page.getByText("Font", { exact: true })).toBeVisible();
    await expect(page.getByText("Pozycja tekstu")).toBeVisible();
  });
});
