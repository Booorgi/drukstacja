const { test, expect } = require("@playwright/test");

async function waitForKeychainScene(page) {
  await page.goto("/breloki");
  await expect(page.getByRole("heading", { name: "Płaskorzeźba Hexagon" })).toBeVisible();
  await page.waitForFunction(
    () =>
      Boolean(
        window.__KEYCHAIN_EXPORTER &&
          typeof window.__KEYCHAIN_EXPORTER.inspectPartLocals === "function" &&
          window.__KEYCHAIN_EXPORTER.inspectPartLocals()
      ),
    null,
    { timeout: 20000 }
  );
}

function meanXY(parts, predicate) {
  const rows = parts.filter(predicate);
  if (rows.length === 0) return null;
  return {
    x: rows.reduce((sum, row) => sum + row.x, 0) / rows.length,
    y: rows.reduce((sum, row) => sum + row.y, 0) / rows.length,
    count: rows.length,
  };
}

async function readPartLocals(page) {
  return page.evaluate(() => window.__KEYCHAIN_EXPORTER.inspectPartLocals());
}

test.describe("breloki graphic offset vs rim (#23)", () => {
  test("moving graphic sliders does not move the rim or base", async ({ page }) => {
    await waitForKeychainScene(page);
    await page.getByRole("button", { name: "Grafika" }).click();

    const before = await readPartLocals(page);
    const beforeBase = meanXY(before, (p) => p.role === "base_mesh");
    const beforeRim = meanXY(before, (p) => p.role === "border_mesh");
    const beforeGraphic = meanXY(before, (p) => p.role === "graphic_mesh");

    expect(beforeBase).not.toBeNull();
    expect(beforeRim).not.toBeNull();
    expect(beforeGraphic).not.toBeNull();
    expect(beforeRim.x).toBeCloseTo(beforeBase.x, 4);
    expect(beforeRim.y).toBeCloseTo(beforeBase.y, 4);

    const sliderX = page.locator('[data-graphic-offset="x"]');
    const sliderY = page.locator('[data-graphic-offset="y"]');
    await sliderX.fill("12");
    await sliderY.fill("-8");
    await expect(page.getByText("12 mm")).toBeVisible();
    await expect(page.getByText("-8 mm")).toBeVisible();

    await page.waitForTimeout(250);
    const after = await readPartLocals(page);
    const afterBase = meanXY(after, (p) => p.role === "base_mesh");
    const afterRim = meanXY(after, (p) => p.role === "border_mesh");
    const afterGraphic = meanXY(after, (p) => p.role === "graphic_mesh");

    expect(afterBase.x).toBeCloseTo(beforeBase.x, 3);
    expect(afterBase.y).toBeCloseTo(beforeBase.y, 3);
    expect(afterRim.x).toBeCloseTo(beforeRim.x, 3);
    expect(afterRim.y).toBeCloseTo(beforeRim.y, 3);
    expect(afterRim.x).toBeCloseTo(afterBase.x, 4);
    expect(afterRim.y).toBeCloseTo(afterBase.y, 4);

    expect(afterGraphic.x - beforeGraphic.x).toBeCloseTo(12, 2);
    expect(afterGraphic.y - beforeGraphic.y).toBeCloseTo(-8, 2);
  });
});
