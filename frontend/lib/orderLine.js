import { shopCategoryLabel } from "./shopCategories";

export const SHOP_SKU_TECHNOLOGY = "shop_sku";

export function isShopSkuLine(item) {
  return (item?.technology || "") === SHOP_SKU_TECHNOLOGY;
}

export function cartLineSubtitle(item) {
  if (!item) return "";
  if (isShopSkuLine(item)) {
    return shopCategoryLabel(item.material) || "Sklep";
  }
  return item.material || "";
}
