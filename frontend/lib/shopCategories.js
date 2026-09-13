export const SHOP_CATEGORIES = [
  { slug: "materialy", label: "Materiały", hint: "filament, kleje (Magigoo), spraye, taśmy" },
  { slug: "hardware", label: "Hardware", hint: "wkładki mosiężne, śruby, magnesy" },
  { slug: "narzedzia", label: "Narzędzia", hint: "gratowniki, szczypce i obróbka" },
  { slug: "gotowe-printy", label: "Gotowe printy", hint: "zabawki użytkowe" },
  { slug: "akcesoria", label: "Akcesoria", hint: "stoły, dysze, organizery" },
];

const BY_SLUG = Object.fromEntries(SHOP_CATEGORIES.map((item) => [item.slug, item]));

export function shopCategoryMeta(slug) {
  return BY_SLUG[slug] || null;
}

export function shopCategoryLabel(slugOrLabel) {
  if (!slugOrLabel) return "Sklep";
  const direct = BY_SLUG[slugOrLabel];
  if (direct) return direct.label;
  const byLabel = SHOP_CATEGORIES.find((item) => item.label === slugOrLabel);
  return byLabel ? byLabel.label : String(slugOrLabel);
}

export function normalizeShopCategory(value) {
  if (value == null) return null;
  const raw = String(Array.isArray(value) ? value[0] : value).trim();
  if (!raw) return null;
  if (BY_SLUG[raw]) return raw;
  const byLabel = SHOP_CATEGORIES.find(
    (item) => item.label.toLowerCase() === raw.toLowerCase()
  );
  return byLabel ? byLabel.slug : null;
}

export function emptyCategoryCopy(slug) {
  if (slug === "gotowe-printy") {
    return {
      title: "Na razie brak zabawek użytkowych",
      body: "Ta półka jest tylko na praktyczne printy na co dzień. Litofany, tabliczki i ozdoby dodamy później — nie mieszamy ich z zabawkami użytkowymi.",
    };
  }
  if (slug === "akcesoria") {
    return {
      title: "Brak produktów w kategorii Akcesoria",
      body: "Stoły robocze, dysze i organizery pojawią się, gdy wejdą na stan magazynu Drukstacja.",
    };
  }
  const label = shopCategoryLabel(slug);
  return {
    title: `Brak produktów w kategorii ${label}`,
    body: "W tej chwili nic tu nie leży. Wróć do Wszystkie albo wybierz inną kategorię.",
  };
}
