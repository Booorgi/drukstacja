const { test, expect } = require("@playwright/test");

async function revealStudio(page) {
  await page.evaluate(() => {
    const el = document.getElementById("configurator");
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo(0, Math.max(0, top));
  });
  await expect
    .poll(async () => page.evaluate(() => !document.documentElement.hasAttribute("data-printer-hero-active")))
    .toBe(true);
}

test.describe("large 3MF skipped preview", () => {
  test("shows Polish status and does not invent 16 g / 11 zł", async ({ page }) => {
    await page.goto("/?studioLayout=preview-skipped");
    await revealStudio(page);

    await expect(page.locator("[data-studio-preview-status='skipped']")).toBeVisible();
    await expect(page.getByText(/Podgląd niemożliwy ze względu na dużą objętość siatki/)).toBeVisible();
    await expect(page.getByText("Upuść model tutaj")).toHaveCount(0);
    await expect(page.getByText("Zapisany profil druku")).toBeVisible();
    await expect(page.locator("[data-quote-state='rfq']")).toBeVisible();
    await expect(page.getByText("11.62")).toHaveCount(0);
    await expect(page.getByText("16 g")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Do koszyka" })).toHaveCount(0);
  });

  test("geometry quote stays visible when only the 3D preview is skipped", async ({ page }) => {
    await page.goto("/?studioLayout=preview-skipped-quoted");
    await revealStudio(page);

    await expect(page.locator("[data-studio-preview-status='skipped']")).toBeVisible();
    await expect(page.locator("[data-quote-ready='true']")).toBeVisible();
    await expect(page.getByText("Wycena gotowa — bez podglądu 3D")).toBeVisible();
    await expect(page.getByText(/Podgląd niemożliwy ze względu na dużą objętość siatki/)).toBeVisible();
    await expect(page.locator("[data-quote-state='quoted']")).toBeVisible();
    await expect(page.getByText("518 g")).toBeVisible();
    await expect(page.getByText("16 g")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Do koszyka" })).toBeEnabled();
  });
});
