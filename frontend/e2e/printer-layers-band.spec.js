const { test, expect } = require("@playwright/test");

test.describe("homepage printer layers hero", () => {
  test("sits above the studio and scrubs video time with scroll", async ({ page }) => {
    await page.goto("/");

    const hero = page.locator("[data-printer-layers-hero]");
    await expect(hero).toBeVisible();
    await expect(hero.getByRole("img", { name: "drukstacja" })).toBeVisible();
    await expect(hero.getByRole("heading", { name: "Wycena druku 3D w studio" })).toBeVisible();
    await expect(hero.getByText("Wgraj model, dobierz filament i warstwę")).toBeVisible();

    const video = page.locator("[data-printer-layers-video]");
    await expect(video).toBeAttached();
    await expect(video).toHaveAttribute("poster", "/videos/printer-layers-poster.jpg");
    await expect(video).toHaveAttribute("playsinline", "");
    await expect(video.locator('source[type="video/webm"]')).toHaveAttribute(
      "src",
      "/videos/printer-layers-loop.webm"
    );
    await expect(video.locator('source[type="video/mp4"]')).toHaveAttribute(
      "src",
      "/videos/printer-layers-loop.mp4"
    );
    await expect.poll(async () => video.evaluate((el) => el.muted === true)).toBe(true);
    await expect
      .poll(async () => video.evaluate((el) => el.readyState >= 1 && el.duration > 0))
      .toBe(true);

    const configurator = page.locator("#configurator");
    await expect(configurator).toBeVisible();
    await expect(page.getByText("Upuść model tutaj")).toBeVisible();

    const heroBox = await hero.boundingBox();
    const studioBox = await page.locator("[data-studio-surface]").boundingBox();
    expect(heroBox, "hero should have a box").toBeTruthy();
    expect(studioBox, "studio surface should have a box").toBeTruthy();
    expect(heroBox.y + heroBox.height, "hero must sit above the studio").toBeLessThanOrEqual(
      studioBox.y + 1
    );

    const quoteBarBox = await page.locator("[data-studio-quote-bar]").boundingBox();
    expect(quoteBarBox, "quote bar should have a box").toBeTruthy();
    expect(quoteBarBox.y, "quote bar must stay below the hero while it is on screen").toBeGreaterThanOrEqual(
      heroBox.y + heroBox.height - 1
    );

    const mode = await hero.getAttribute("data-printer-mode");
    if (mode === "scrub") {
      const t0 = await video.evaluate((el) => el.currentTime);
      await page.evaluate(() => {
        const studio = document.querySelector("#configurator");
        window.scrollTo(0, Math.max(120, (studio?.offsetTop || 400) * 0.55));
      });
      await expect
        .poll(async () => video.evaluate((el) => el.currentTime), { timeout: 4000 })
        .toBeGreaterThan(t0 + 0.05);
    }
  });

  test("shows poster and copy when reduced motion is preferred", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const hero = page.locator("[data-printer-layers-hero]");
    await expect(hero).toBeVisible();
    await expect(hero).toHaveAttribute("data-printer-mode", "poster");
    await expect(page.locator("[data-printer-layers-video]")).toHaveCount(0);
    await expect(hero.getByRole("img", { name: "drukstacja" })).toBeVisible();
    await expect(hero.getByRole("heading", { name: "Wycena druku 3D w studio" })).toBeVisible();
    await expect(page.getByText("Upuść model tutaj")).toBeVisible();
  });
});
