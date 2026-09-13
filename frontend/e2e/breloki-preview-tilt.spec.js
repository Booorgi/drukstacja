const { test, expect } = require("@playwright/test");

async function installIosOrientationMock(page, { permission = "granted" } = {}) {
  await page.addInitScript(({ permissionResult }) => {
    window.__orientPermCalls = 0;
    const FakeDOE = function DeviceOrientationEvent(type, init) {
      const event = new Event(type);
      event.alpha = init && init.alpha != null ? init.alpha : 0;
      event.beta = init && init.beta != null ? init.beta : 0;
      event.gamma = init && init.gamma != null ? init.gamma : 0;
      return event;
    };
    FakeDOE.requestPermission = async () => {
      window.__orientPermCalls += 1;
      return permissionResult;
    };
    window.DeviceOrientationEvent = FakeDOE;
  }, { permissionResult: permission });
}

async function openBreloki(page) {
  await page.goto("/breloki");
  await expect(page.getByRole("heading", { name: "Płaskorzeźba Hexagon" })).toBeVisible();
}

test.describe("breloki preview tilt + 5 zł chip", () => {
  test("Porównaj z 5 zł is a compact chip", async ({ page }) => {
    await openBreloki(page);

    const chip = page.locator("[data-scale-compare]");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText(/Porównaj z 5 zł/);

    const box = await chip.boundingBox();
    expect(box, "compare chip should have a box").toBeTruthy();
    expect(box.height, "chip height should be compact").toBeLessThanOrEqual(32);
    expect(box.width, "chip width should be compact").toBeLessThanOrEqual(160);

    await chip.click();
    await expect(chip).toHaveClass(/bg-amber-500/);
  });

  test("iOS permission is requested once from Rusz telefonem", async ({ page }) => {
    await installIosOrientationMock(page, { permission: "granted" });
    await openBreloki(page);

    const enable = page.locator("[data-tilt-enable]");
    await expect(enable).toBeVisible();
    await expect(enable).toHaveText("Rusz telefonem");

    await enable.click();

    await expect.poll(async () => page.evaluate(() => window.__orientPermCalls)).toBe(1);

    await enable.click({ timeout: 2000 }).catch(() => {});
    await expect.poll(async () => page.evaluate(() => window.__orientPermCalls)).toBe(1);

    await page.evaluate(() => {
      const event = new window.DeviceOrientationEvent("deviceorientation", {
        beta: 60,
        gamma: 25,
      });
      window.dispatchEvent(event);
    });

    await expect.poll(async () =>
      page.evaluate(() => Boolean(window.__KEYCHAIN_TILT && window.__KEYCHAIN_TILT.active))
    ).toBe(true);

    const tilt = await page.evaluate(() => window.__KEYCHAIN_TILT);
    expect(tilt.z).not.toBe(0);
    expect(Math.abs(tilt.x)).toBeLessThan(Math.PI / 4 + 0.01);
    expect(Math.abs(tilt.z)).toBeLessThan(Math.PI / 4 + 0.01);

    await expect(page.locator("[data-tilt-active]")).toBeVisible();
    await expect(page.locator("[data-tilt-active]")).toHaveText("Przechyl telefon");
    await expect(page.getByText("Pociągnij lub przechyl")).toBeVisible();

    await enable.click({ timeout: 1000 }).catch(() => {});
    expect(await page.evaluate(() => window.__orientPermCalls)).toBe(1);
  });

  test("denied permission does not re-prompt", async ({ page }) => {
    await installIosOrientationMock(page, { permission: "denied" });
    await openBreloki(page);

    const enable = page.locator("[data-tilt-enable]");
    await expect(enable).toBeVisible();
    await enable.click();

    await expect.poll(async () => page.evaluate(() => window.__orientPermCalls)).toBe(1);
    await expect(enable).toHaveCount(0);

    await page.locator("canvas").first().click({ position: { x: 40, y: 40 } });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__orientPermCalls)).toBe(1);
  });

  test("desktop has no tilt prompt and drag hint stays", async ({ page }) => {
    await openBreloki(page);
    await expect(page.locator("[data-tilt-enable]")).toHaveCount(0);
    await expect(page.getByText("Pociągnij brelok")).toBeVisible();
    await expect(page.locator("[data-scale-compare]")).toBeVisible();
  });
});
