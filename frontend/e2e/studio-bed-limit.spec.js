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

test.describe("studio print-bed dimension limit", () => {
  test("blocks add-to-cart for an oversized model until it is scaled to the 256 mm bed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?studioLayout=oversized");
    await revealStudio(page);

    await expect(page.getByRole("heading", { name: "monstera_b02.glb" })).toBeVisible();
    await expect(page.locator("[data-quote-state='quoted']")).toBeVisible();
    await expect(page.locator("[data-studio-quote-bar]")).toHaveAttribute("data-oversize", "true");

    const warning = page.locator("[data-print-bed-warning]");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("256 × 256 × 256");
    await expect(warning).toContainText("Zmniejsz skalę");

    const dims = page.locator("[data-studio-dimensions]");
    await expect(dims).toBeVisible();
    await expect(dims).toHaveAttribute("data-oversize", "true");
    await expect(dims).toContainText("X 388.6");
    await expect(dims).toContainText("Y 343.1");
    await expect(dims).toContainText("Z 393.9");
    await expect(dims.locator("[data-print-bed-limit]")).toContainText("256 × 256 × 256");

    const cta = page.locator("[data-studio-quote-bar]").getByRole("button", { name: "Do koszyka" });
    await expect(cta).toBeDisabled();

    await page.locator("[data-fit-to-bed]").click();

    await expect(page.locator("[data-studio-quote-bar]")).toHaveAttribute("data-oversize", "false");
    await expect(warning).toHaveCount(0);
    await expect(dims).toHaveAttribute("data-oversize", "false");
    await expect(dims).toContainText("X 248.7");
    await expect(page.locator("[data-studio-control-rail-frame]").getByText("64%")).toBeVisible();
    await expect(cta).toBeEnabled();
  });

  test("scale popover offers Dopasuj do stołu while the model is oversize", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?studioLayout=oversized");
    await revealStudio(page);

    await page.locator('[data-studio-wheel="Skala"]').click();
    const scale = page.locator('[data-studio-scale-surface="popover"]');
    await expect(scale).toBeVisible();
    await expect(scale.getByText(/Nie mieści się na stole 256/)).toBeVisible();
    await expect(scale.getByRole("button", { name: /Dopasuj do stołu \(64%\)/ })).toBeVisible();

    await scale.getByRole("button", { name: /Dopasuj do stołu \(64%\)/ }).click();
    await expect(page.locator("[data-studio-quote-bar]")).toHaveAttribute("data-oversize", "false");
    await expect(page.getByRole("button", { name: "Do koszyka" })).toBeEnabled();
  });
});
