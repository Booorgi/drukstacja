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

function rgbToHex(rgb) {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return rgb;
  return `#${[m[1], m[2], m[3]]
    .map((n) => Number(n).toString(16).padStart(2, "0"))
    .join("")}`;
}

test.describe("homepage dark UX", () => {
  test("hero CTA, dark surfaces, SVG material icons, engineer box", async ({ page }) => {
    await page.goto("/");

    const hero = page.locator("[data-printer-layers-hero]");
    await expect(hero.getByRole("button", { name: "Wgraj plik do wyceny" })).toBeVisible();

    const pageBg = await page.locator("div.min-h-screen").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(rgbToHex(pageBg)).toMatch(/#09090b|#18181b|#000000/i);

    await hero.getByRole("button", { name: "Wgraj plik do wyceny" }).click();
    await expect(page.locator("#configurator")).toBeInViewport();
    await expect(page.getByText("Upuść model tutaj")).toBeVisible();

    const studioBg = await page.locator("[data-studio-surface]").evaluate((el) => getComputedStyle(el).backgroundColor);
    const studioHex = rgbToHex(studioBg);
    expect(studioHex === "#e2e2e2", `studio surface should not stay light grey (${studioHex})`).toBeFalsy();

    await page.locator("#materialy").scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "Czym drukujemy?" })).toBeVisible();
    await expect(page.locator("[data-material-card='pla']")).toHaveAttribute("data-featured", "true");
    await expect(page.getByText("Najczęściej wybierany")).toBeVisible();
    await expect(page.getByText("🔥")).toHaveCount(0);
    await expect(page.getByText("☀️")).toHaveCount(0);
    await expect(page.getByText("💪")).toHaveCount(0);
    await expect(page.getByText("💰")).toHaveCount(0);

    const plaTags = page.locator("[data-material-card='pla'] span.rounded-full").filter({ hasText: /Prototypy|Modele|Dekoracje|Wnętrze|Obudowy/ });
    await expect(plaTags).toHaveCount(3);

    await page.locator("[data-material-card='pla']").getByRole("button", { name: "Więcej parametrów technicznych" }).click();
    await expect(page.locator("[data-material-tech-modal]")).toBeVisible();
    await expect(page.locator("[data-material-tech-modal]").getByText("Wnętrze")).toBeVisible();
    await page.locator("[data-material-tech-modal]").getByRole("button", { name: "Zamknij", exact: true }).click();
    await expect(page.locator("[data-material-tech-modal]")).toHaveCount(0);
  });

  test("quoted studio shows engineer review and keeps cart enabled above 30 zł", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?studioLayout=quoted");
    await revealStudio(page);

    await expect(page.locator("[data-quote-state='quoted']")).toBeVisible();
    await expect(page.locator("[data-quote-total]")).toHaveText("38.00");
    await expect(page.locator("[data-engineer-review]")).toBeVisible();
    await expect(page.locator("[data-engineer-review]")).toContainText(
      "Nie masz pewności? Zaznacz darmową weryfikację przez inżyniera przed startem druku"
    );
    await expect(page.getByRole("button", { name: "Do koszyka" })).toBeEnabled();
    await expect(page.locator("[data-studio-scene-nav]")).toBeVisible();
    await expect(page.locator('[data-scene-nav="podpory"]')).toBeVisible();
    await expect(page.locator('[data-scene-nav="podpory"]')).not.toHaveClass(/bg-\[#EF4444\]/);
  });

  test("below 30 zł blocks Do koszyka and shows the shortfall", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?studioLayout=below-moq");
    await revealStudio(page);

    await expect(page.locator("[data-studio-quote-bar]")).toHaveAttribute("data-below-moq", "true");
    await expect(page.locator("[data-moq-shortfall]")).toBeVisible();
    await expect(page.locator("[data-moq-shortfall]")).toContainText("Brakuje 11,60 zł do minimalnego zamówienia");
    await expect(page.getByRole("button", { name: "Do koszyka" })).toBeDisabled();
  });
});
