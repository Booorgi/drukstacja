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

async function openQuotedStudio(page) {
  await page.goto("/?studioLayout=quoted");
  await revealStudio(page);
  await expect(page.getByRole("heading", { name: "Watch case 1.stl" })).toBeVisible();
  await expect(page.locator("[data-studio-control-rail]")).toHaveAttribute("data-empty", "false");
}

test.describe("studio color picker", () => {
  test("desktop: Kolor opens a popover; Materiał and Parametry stay exclusive", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openQuotedStudio(page);

    const rail = page.locator("[data-studio-control-rail-frame]");
    const colorWheel = page.locator('[data-studio-wheel="Kolor"]');
    const materialWheel = page.locator('[data-studio-wheel="Materiał"]');
    const paramsWheel = page.locator('[data-studio-wheel="Parametry"]');

    await expect(colorWheel).toBeVisible();
    await expect(colorWheel).toHaveAttribute("aria-haspopup", "dialog");
    await expect(colorWheel).toHaveAttribute("aria-expanded", "false");
    await expect(materialWheel).toHaveAttribute("aria-haspopup", "dialog");
    await expect(rail.locator("span").filter({ hasText: "Beige" })).toBeVisible();

    await colorWheel.click();
    const picker = page.locator('[data-studio-color-picker-surface="popover"]');
    await expect(picker).toBeVisible();
    await expect(colorWheel).toHaveAttribute("aria-expanded", "true");
    await expect(picker.getByText("Kolor filamentu")).toBeVisible();
    await expect(picker.getByText(/PLA/)).toBeVisible();
    await expect(picker.getByText(/PLA Tough/)).toHaveCount(0);
    await expect(picker.getByText(/zł\/kg/i)).toHaveCount(0);
    await expect(picker.locator("[data-studio-color-swatch]")).toHaveCount(32);

    const wheelBox = await colorWheel.boundingBox();
    const pickerBox = await picker.boundingBox();
    expect(pickerBox.x, "desktop popover sits to the right of the Kolor wheel").toBeGreaterThan(wheelBox.x + wheelBox.width - 8);

    await picker.getByRole("button", { name: "Ceramic" }).click();
    await expect(picker).toHaveCount(0);
    await expect(rail.locator("span").filter({ hasText: "Ceramic" })).toBeVisible();

    await materialWheel.click();
    const materials = page.locator('[data-studio-material-picker-surface="popover"]');
    await expect(materials).toBeVisible();
    await expect(page.locator("[data-studio-color-picker]")).toHaveCount(0);
    await expect(page.getByText("Parametry druku")).toHaveCount(0);
    await materials.locator('[data-studio-material-option="PLA"]').click();
    await expect(materials.getByText("Wybierz rodzaj PLA")).toBeVisible();
    await materials.locator('[data-studio-material-subtype="PLA_WOOD"]').click();
    await expect(materials).toHaveCount(0);
    await expect(rail.locator("span").filter({ hasText: "PLA · Wood" })).toBeVisible();

    await paramsWheel.click();
    await expect(page.getByText("Parametry druku")).toBeVisible();
    await expect(page.locator("[data-studio-color-picker]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "0.4 mm" })).toBeVisible();
  });

  test("mobile: Kolor opens a bottom sheet with large swatches", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openQuotedStudio(page);

    const rail = page.locator("[data-studio-control-rail-frame]");
    const colorWheel = page.locator('[data-studio-wheel="Kolor"]');
    await expect(colorWheel).toBeVisible();
    await expect(rail.locator("span").filter({ hasText: "Beige" })).toBeVisible();

    await colorWheel.click();
    const picker = page.locator('[data-studio-color-picker-surface="sheet"]');
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("button", { name: "Ceramic" })).toBeVisible();
    await expect(picker.locator("[data-studio-color-swatch]")).toHaveCount(32);

    const pickerBox = await picker.boundingBox();
    expect(pickerBox.y, "mobile sheet sits in the lower half for one-handed use").toBeGreaterThan(300);

    const swatch = picker.getByRole("button", { name: "Midnight" });
    const swatchBox = await swatch.boundingBox();
    expect(swatchBox.width, "swatch hit target width").toBeGreaterThanOrEqual(44);
    expect(swatchBox.height, "swatch hit target height").toBeGreaterThanOrEqual(44);

    await swatch.click();
    await expect(picker).toHaveCount(0);
    await expect(rail.locator("span").filter({ hasText: "Midnight" })).toBeVisible();
  });
});
