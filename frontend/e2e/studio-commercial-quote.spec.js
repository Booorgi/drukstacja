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

test.describe("studio commercial quote", () => {
  test("whale STL quotes competitor ballpark, not raw 2.57 PLN plastic", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?studioLayout=whale");
    await revealStudio(page);

    const bar = page.locator("[data-studio-quote-bar]");
    await expect(page.locator("[data-quote-state='quoted']")).toBeVisible();
    await expect(bar.getByText("12.60")).toBeVisible();
    await expect(bar.getByText("2.57")).toHaveCount(0);
    await expect(bar.getByText("57.2 g")).toBeVisible();
    await expect(bar.getByText("5h 27m")).toBeVisible();
    await expect(bar).toHaveAttribute("data-below-moq", "true");
    await expect(page.locator("[data-moq-shortfall]")).toContainText("Brakuje 17,40 zł do minimalnego zamówienia");
    await expect(page.getByText(/zł\/kg/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Do koszyka" })).toBeDisabled();
  });

  test("Photoset fixture stays on 20.31 — not 22.84 stale hours or 35.02 volume", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?studioLayout=preview-skipped-sliced");
    await revealStudio(page);

    const bar = page.locator("[data-studio-quote-bar]");
    await expect(bar.locator("[data-quote-total]")).toHaveText("20.31");
    await expect(bar.getByText("146.74 g")).toBeVisible();
    await expect(bar.getByText("5h 6m")).toBeVisible();
    await expect(page.getByText("22.84")).toHaveCount(0);
    await expect(page.getByText("35.02")).toHaveCount(0);
    await expect(page.getByText("45.53")).toHaveCount(0);
    await expect(bar).toHaveAttribute("data-below-moq", "true");
  });
});
