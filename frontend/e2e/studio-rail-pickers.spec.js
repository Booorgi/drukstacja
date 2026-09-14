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

async function openEmptyStudio(page) {
  await page.goto("/");
  await revealStudio(page);
  await expect(page.getByText("Upuść model tutaj")).toBeVisible();
  await expect(page.locator("[data-studio-control-rail]")).toHaveAttribute("data-empty", "true");
}

async function assertSheetClearsHeader(page, sheet) {
  const header = page.locator("header").first();
  await expect(sheet).toBeVisible();
  await expect(header).toBeVisible();

  const headerBox = await header.boundingBox();
  const sheetBox = await sheet.boundingBox();
  expect(headerBox, "navbar should have a box").toBeTruthy();
  expect(sheetBox, "sheet should have a box").toBeTruthy();
  expect(sheetBox.y, "sheet must sit below the sticky navbar").toBeGreaterThan(
    headerBox.y + headerBox.height - 0.5
  );
  const viewport = page.viewportSize();
  expect(sheetBox.y + sheetBox.height, "sheet is docked to the bottom edge").toBeGreaterThan(
    viewport.height - 24
  );

  const opacity = await sheet.evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(opacity, "sheet must be fully opaque").toBe(1);
}

async function assertFamilyCatalog(picker) {
  await expect(picker.locator('[data-studio-material-option="PLA"]')).toBeVisible();
  await expect(picker.locator('[data-studio-material-option="PETG"]')).toBeVisible();
  await expect(picker.locator('[data-studio-material-option="ASA"]')).toBeVisible();
  await expect(picker.locator('[data-studio-material-option="TPU"]')).toBeVisible();
  await expect(picker.locator('[data-studio-material-option="PLA_WOOD"]')).toHaveCount(0);
  await expect(picker.locator('[data-studio-material-option="PLA_RAINBOW"]')).toHaveCount(0);
  await expect(picker.locator('[data-studio-material-option="PLA_GALAXY"]')).toHaveCount(0);
  await expect(picker.locator('[data-studio-material-option="PETG_FR"]')).toHaveCount(0);
  await expect(picker.getByText(/zł\/kg/i)).toHaveCount(0);
  await expect(picker.getByText(/45\s*zł/i)).toHaveCount(0);
}

async function pickPlaWood(picker) {
  await picker.locator('[data-studio-material-option="PLA"]').click();
  await expect(picker).toHaveAttribute("data-studio-material-step", "subtype");
  await expect(picker.getByText("Wybierz rodzaj PLA")).toBeVisible();
  await expect(picker.locator('[data-studio-material-subtype="PLA_WOOD"]')).toBeVisible();
  await expect(picker.locator('[data-studio-material-subtype="PLA_RAINBOW"]')).toBeVisible();
  await picker.locator('[data-studio-material-subtype="PLA_WOOD"]').click();
}

test.describe("studio rail pickers", () => {
  test("desktop: Materiał, Parametry and Skala open popovers", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?studioLayout=quoted");
    await revealStudio(page);

    const rail = page.locator("[data-studio-control-rail-frame]");
    const materialWheel = page.locator('[data-studio-wheel="Materiał"]');
    const paramsWheel = page.locator('[data-studio-wheel="Parametry"]');
    const scaleWheel = page.locator('[data-studio-wheel="Skala"]');

    await expect(materialWheel).toBeVisible();
    await expect(materialWheel).toHaveAttribute("aria-haspopup", "dialog");
    await expect(materialWheel).toHaveAttribute("aria-expanded", "false");

    await materialWheel.click();
    const materials = page.locator('[data-studio-material-picker-surface="popover"]');
    await expect(materials).toBeVisible();
    await expect(materialWheel).toHaveAttribute("aria-expanded", "true");
    await expect(materials.getByText("Materiał", { exact: true })).toBeVisible();
    await expect(materials).toHaveAttribute("data-studio-material-step", "family");
    await assertFamilyCatalog(materials);
    await expect(page.locator('[data-studio-material-picker-surface="sheet"]')).toHaveCount(0);

    const wheelBox = await materialWheel.boundingBox();
    const pickerBox = await materials.boundingBox();
    const viewport = page.viewportSize();
    expect(pickerBox.x, "desktop popover sits to the right of the Materiał wheel").toBeGreaterThan(
      wheelBox.x + wheelBox.width - 8
    );
    expect(pickerBox.y, "desktop popover stays below the top of the viewport").toBeGreaterThanOrEqual(0);
    expect(pickerBox.y + pickerBox.height, "desktop popover stays on screen").toBeLessThanOrEqual(
      viewport.height + 1
    );
    await expect(materials.locator('[data-studio-material-option="PLA"]')).toBeInViewport();
    const opacity = await materials.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(opacity, "desktop material panel must be fully opaque").toBe(1);

    const plaBox = await materials.locator('[data-studio-material-option="PLA"]').boundingBox();
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest("[data-studio-material-option]")?.getAttribute("data-studio-material-option") : null;
    }, { x: plaBox.x + plaBox.width / 2, y: plaBox.y + plaBox.height / 2 });
    expect(hit, "material rows must sit above the quote bar").toBe("PLA");

    await pickPlaWood(materials);
    await expect(materials).toHaveCount(0);
    await expect(rail.locator("span").filter({ hasText: /Wood/ })).toBeVisible();

    await paramsWheel.click();
    const params = page.locator('[data-studio-print-params-surface="popover"]');
    await expect(params).toBeVisible();
    await expect(params.getByRole("button", { name: "0.4 mm" })).toBeVisible();
    await expect(page.locator('[data-studio-print-params-surface="sheet"]')).toBeHidden();

    await scaleWheel.click();
    const scale = page.locator('[data-studio-scale-surface="popover"]');
    await expect(scale).toBeVisible();
    await expect(scale.getByText("Skala modelu")).toBeVisible();
    await expect(page.getByText("Parametry druku")).toHaveCount(0);
  });

  test("desktop empty state: Materiał opens a usable popover", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openEmptyStudio(page);

    const materialWheel = page.locator('[data-studio-wheel="Materiał"]');
    await expect(materialWheel).toBeVisible();
    await expect(materialWheel).toHaveAttribute("aria-expanded", "false");

    await materialWheel.click();
    const picker = page.locator('[data-studio-material-picker-surface="popover"]');
    await expect(picker).toBeVisible();
    await expect(materialWheel).toHaveAttribute("aria-expanded", "true");
    await assertFamilyCatalog(picker);
    await expect(page.locator('[data-studio-material-picker-surface="sheet"]')).toHaveCount(0);

    await pickPlaWood(picker);
    await expect(picker).toHaveCount(0);
    await expect(
      page.locator("[data-studio-control-rail-frame]").locator("span").filter({ hasText: /Wood/ })
    ).toBeVisible();
  });

  test("mobile empty state: Materiał opens a usable sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEmptyStudio(page);

    const materialWheel = page.locator('[data-studio-wheel="Materiał"]');
    await expect(materialWheel).toBeVisible();
    await expect(materialWheel).toHaveAttribute("aria-expanded", "false");

    await materialWheel.click();
    const sheet = page.locator('[data-studio-material-picker-surface="sheet"]');
    await expect(sheet).toBeVisible();
    await expect(materialWheel).toHaveAttribute("aria-expanded", "true");
    await expect(sheet.getByText("Materiał", { exact: true })).toBeVisible();
    await assertFamilyCatalog(sheet);
    await assertSheetClearsHeader(page, sheet);

    await pickPlaWood(sheet);
    await expect(sheet).toHaveCount(0);
    await expect(
      page.locator("[data-studio-control-rail-frame]").locator("span").filter({ hasText: /Wood/ })
    ).toBeVisible();
  });

  test("mobile empty state: Kolor, Parametry and Skala sheets clear the navbar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEmptyStudio(page);

    await page.locator('[data-studio-wheel="Kolor"]').click();
    const color = page.locator('[data-studio-color-picker-surface="sheet"]');
    await expect(color).toBeVisible();
    await expect(color.getByText("Kolor filamentu")).toBeVisible();
    await assertSheetClearsHeader(page, color);

    await page.keyboard.press("Escape");
    await expect(color).toHaveCount(0);

    await page.locator('[data-studio-wheel="Parametry"]').click();
    const params = page.locator('[data-studio-print-params-surface="sheet"]');
    await expect(params).toBeVisible();
    await expect(params.getByText("Parametry druku")).toBeVisible();
    await expect(params.getByRole("button", { name: "20%" })).toBeVisible();
    await assertSheetClearsHeader(page, params);

    await page.keyboard.press("Escape");
    await expect(params).toHaveCount(0);

    await page.locator('[data-studio-wheel="Skala"]').click();
    const scale = page.locator('[data-studio-scale-surface="sheet"]');
    await expect(scale).toBeVisible();
    await expect(scale.getByText("Skala modelu")).toBeVisible();
    await expect(scale.getByRole("button", { name: "100%" })).toBeVisible();
    await assertSheetClearsHeader(page, scale);
  });
});
