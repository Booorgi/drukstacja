const { test, expect } = require("@playwright/test");

test.describe("homepage hub tiles", () => {
  test("replaces the video hero with quote, shop, and generator tiles above the studio", async ({
    page,
  }) => {
    await page.goto("/");

    const hub = page.locator("[data-home-hub]");
    await expect(hub).toBeVisible();
    await expect(hub.getByRole("heading", { name: "Druk 3D i breloki — wycena od razu" })).toBeVisible();
    await expect(hub.getByText("Wgraj model albo zdjęcie")).toBeVisible();

    const quote = hub.locator('[data-home-hub-tile="wycena"]');
    const shop = hub.locator('[data-home-hub-tile="sklep"]');
    const generators = hub.locator('[data-home-hub-tile="generatory"]');

    await expect(quote).toBeVisible();
    await expect(quote).toHaveAttribute("href", "/#configurator");
    await expect(quote.getByRole("heading", { name: "Wyceń druk" })).toBeVisible();

    await expect(shop).toBeVisible();
    await expect(shop).toHaveAttribute("href", "/sklep");
    await expect(shop.getByRole("heading", { name: "Sklep" })).toBeVisible();

    await expect(generators).toBeVisible();
    await expect(generators).toHaveAttribute("href", "/breloki");
    await expect(generators.getByRole("heading", { name: "Generatory" })).toBeVisible();

    await expect(page.locator("video")).toHaveCount(0);
    await expect(page.locator("[data-printer-layers-hero]")).toHaveCount(0);
    await expect(page.locator("[data-printer-layers-video]")).toHaveCount(0);

    const configurator = page.locator("#configurator");
    await expect(configurator).toBeVisible();
    await expect(page.getByText("Upuść model tutaj")).toBeVisible();

    const hubBox = await hub.boundingBox();
    const studioBox = await page.locator("[data-studio-surface]").boundingBox();
    expect(hubBox, "hub should have a box").toBeTruthy();
    expect(studioBox, "studio surface should have a box").toBeTruthy();
    expect(hubBox.y + hubBox.height, "hub must sit above the studio").toBeLessThanOrEqual(
      studioBox.y + 1
    );
  });

  test("Wyceń druk scrolls to the configurator on the homepage", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-home-hub-tile="wycena"]').click();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const el = document.getElementById("configurator");
          if (!el) return false;
          const top = el.getBoundingClientRect().top;
          return top >= 0 && top < 160;
        })
      )
      .toBe(true);
    await expect(page.locator("#configurator")).toBeInViewport();
  });

  test("Sklep and Generatory tiles open existing routes", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-home-hub-tile="sklep"]').click();
    await expect(page).toHaveURL(/\/sklep/);
    await expect(page.getByRole("heading", { name: /Gotowe komponenty/ })).toBeVisible();

    await page.goto("/");
    await page.locator('[data-home-hub-tile="generatory"]').click();
    await expect(page).toHaveURL(/\/breloki/);
  });
});
