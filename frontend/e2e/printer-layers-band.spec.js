const { test, expect } = require("@playwright/test");

test.describe("homepage printer layers band", () => {
  test("loads looping video sources without covering the studio", async ({ page }) => {
    await page.goto("/");

    const band = page.locator("[data-printer-layers-band]");
    await expect(band).toBeAttached();
    await band.scrollIntoViewIfNeeded();
    await expect(band).toBeVisible();
    await expect(band.getByRole("heading", { name: "Druk warstwami" })).toBeVisible();

    const video = page.locator("[data-printer-layers-video]");
    await expect(video).toBeAttached();
    await expect(video).toHaveAttribute("poster", "/videos/printer-layers-poster.jpg");
    await expect(video).toHaveAttribute("loop", "");
    await expect(video).toHaveAttribute("playsinline", "");
    await expect(video.locator('source[type="video/webm"]')).toHaveAttribute(
      "src",
      "/videos/printer-layers-loop.webm"
    );
    await expect(video.locator('source[type="video/mp4"]')).toHaveAttribute(
      "src",
      "/videos/printer-layers-loop.mp4"
    );
    await expect
      .poll(async () => video.evaluate((el) => el.muted === true && el.loop === true))
      .toBe(true);

    const configurator = page.locator("#configurator");
    await expect(configurator).toBeVisible();
    await expect(page.getByText("Upuść model tutaj")).toBeVisible();

    const bandBox = await band.boundingBox();
    const studioBox = await page.locator("[data-studio-surface]").boundingBox();
    expect(bandBox, "video band should have a box").toBeTruthy();
    expect(studioBox, "studio surface should have a box").toBeTruthy();
    expect(studioBox.y + studioBox.height, "video band must sit below the studio").toBeLessThanOrEqual(
      bandBox.y + 1
    );
  });

  test("shows poster only when reduced motion is preferred", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await expect(page.locator("[data-printer-layers-band]")).toBeVisible();
    await expect(page.locator("[data-printer-layers-video]")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Druk warstwami" })).toBeVisible();
    await expect(page.getByText("Upuść model tutaj")).toBeVisible();
  });
});
