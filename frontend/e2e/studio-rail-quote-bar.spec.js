const { test, expect } = require("@playwright/test");

function boxesOverlap(a, b, slop = 0.5) {
  return (
    a.x < b.x + b.width - slop &&
    a.x + a.width > b.x + slop &&
    a.y < b.y + b.height - slop &&
    a.y + a.height > b.y + slop
  );
}

async function assertRailClearsQuoteBar(page) {
  const rail = page.locator("[data-studio-control-rail-frame]");
  const bar = page.locator("[data-studio-quote-bar]");
  const surface = page.locator("[data-quote-surface='studio']");

  await expect(rail).toBeVisible();
  await expect(bar).toBeVisible();
  await expect(surface).toBeVisible();

  const railBox = await rail.boundingBox();
  const barBox = await bar.boundingBox();
  const surfaceBox = await surface.boundingBox();

  expect(railBox, "rail frame should have a box").toBeTruthy();
  expect(barBox, "quote bar should have a box").toBeTruthy();
  expect(surfaceBox, "quote surface should have a box").toBeTruthy();

  expect(
    boxesOverlap(railBox, barBox),
    `rail frame ${JSON.stringify(railBox)} overlaps quote bar wrapper ${JSON.stringify(barBox)}`
  ).toBeFalsy();
  expect(
    boxesOverlap(railBox, surfaceBox),
    `rail frame ${JSON.stringify(railBox)} overlaps quote surface ${JSON.stringify(surfaceBox)}`
  ).toBeFalsy();

  const cta = page.locator("[data-studio-quote-bar]").getByRole("button", { name: /Do koszyka|Wybierz plik/ });
  await expect(cta).toBeVisible();
  const ctaBox = await cta.boundingBox();
  const sample = page.locator("[data-studio-control-rail-frame] >> text=Materiał");
  await expect(sample).toBeVisible();

  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest("button")?.textContent?.trim() || el.tagName : null;
  }, { x: ctaBox.x + ctaBox.width / 2, y: ctaBox.y + ctaBox.height / 2 });

  expect(hit).toMatch(/Do koszyka|Wybierz plik/i);
}

test.describe("studio left rail vs sticky quote bar", () => {
  test("empty state keeps rail above the quote bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Upuść model tutaj")).toBeVisible();
    await expect(page.locator("[data-studio-control-rail]")).toHaveAttribute("data-empty", "true");
    await expect(page.locator("[data-quote-state='empty']")).toBeVisible();
    await assertRailClearsQuoteBar(page);
  });

  test("quoted state keeps rail above the quote bar", async ({ page }) => {
    await page.goto("/?studioLayout=quoted");
    await expect(page.getByRole("heading", { name: "Watch case 1.stl" })).toBeVisible();
    await expect(page.locator("[data-studio-control-rail]")).toHaveAttribute("data-empty", "false");
    await expect(page.locator("[data-quote-state='quoted']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Do koszyka" })).toBeEnabled();
    await assertRailClearsQuoteBar(page);
  });
});
