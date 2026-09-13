import React, { useMemo, useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Navbar from "../components/Navbar";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import { supabase } from "../lib/supabaseClient";
import { fetchCartOrders } from "../lib/ordersApi";
import { addProductToCart, listProducts } from "../lib/productsApi";
import {
  SHOP_CATEGORIES,
  emptyCategoryCopy,
  normalizeShopCategory,
  shopCategoryLabel,
  shopCategoryMeta,
} from "../lib/shopCategories";

function productPurchasable(prod) {
  return Boolean(prod?.active) && Boolean(prod?.in_stock) && Number(prod?.stock) > 0;
}

function mergeCategoryCounts(apiCategories, products) {
  const fromApi = {};
  (apiCategories || []).forEach((item) => {
    if (item?.slug) fromApi[item.slug] = Number(item.count || 0);
  });
  return SHOP_CATEGORIES.map((meta) => ({
    ...meta,
    count:
      fromApi[meta.slug] != null
        ? fromApi[meta.slug]
        : products.filter((prod) => prod.category === meta.slug).length,
  }));
}

export default function ShopPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [apiCategories, setApiCategories] = useState([]);
  const [catalogState, setCatalogState] = useState("loading");
  const [addingId, setAddingId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) fetchCart(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) fetchCart(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    setSelectedCategory(normalizeShopCategory(router.query.kategoria));
  }, [router.isReady, router.query.kategoria]);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setCatalogState("loading");
      try {
        const data = await listProducts();
        if (!cancelled) {
          setProducts(data.products || []);
          setApiCategories(data.categories || []);
          setCatalogState("ready");
        }
      } catch (err) {
        console.warn("Błąd katalogu sklepu:", err);
        if (!cancelled) {
          setProducts([]);
          setApiCategories([]);
          setCatalogState("error");
        }
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(
    () => mergeCategoryCounts(apiCategories, products),
    [apiCategories, products]
  );

  const visibleProducts = useMemo(() => {
    if (!selectedCategory) return products;
    return products.filter((prod) => prod.category === selectedCategory);
  }, [products, selectedCategory]);

  const selectedMeta = shopCategoryMeta(selectedCategory);
  const emptyCopy = selectedCategory ? emptyCategoryCopy(selectedCategory) : null;

  function selectCategory(slug) {
    const next = slug || null;
    setSelectedCategory(next);
    const query = next ? { kategoria: next } : {};
    router.replace({ pathname: "/sklep", query }, undefined, { shallow: true });
  }

  async function fetchCart(userId) {
    if (!userId) return;
    try {
      setCartItems(await fetchCartOrders());
    } catch (err) {
      console.warn("Błąd koszyka:", err);
    }
  }

  async function handleAddToCart(prod) {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    if (!productPurchasable(prod)) return;

    setAddingId(prod.id);
    try {
      await addProductToCart(prod.id, 1);
      await fetchCart(user.id);
      setIsCartOpen(true);
    } catch (err) {
      const message = String(err?.message || "");
      if (message.toLowerCase().includes("zalog") || message.toLowerCase().includes("token")) {
        setIsAuthOpen(true);
        return;
      }
      alert("Błąd koszyka: " + (err.message || "nie udało się dodać produktu"));
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] font-sans">
      <Head>
        <title>Sklep & Akcesoria Drukarskie — Drukstacja</title>
      </Head>

      <Navbar
        activePage="sklep"
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        cartItems={cartItems}
        onOpenCart={() => setIsCartOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="relative rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8 md:p-12 overflow-hidden shadow-xl">
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EF4444]/20 border border-[#EF4444]/40 text-[#EF4444] text-xs font-bold">
              <span>🛒</span>
              <span>Sklep Przemysłowy Drukstacja</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">
              Gotowe komponenty, narzędzia & materiały
            </h1>
            <p className="text-sm md:text-base text-slate-300">
              Wszystko, czego potrzebujesz do profesjonalnego post-processingu, montażu mechanicznego oraz prototypowania FDM/SLA.
            </p>
          </div>
          <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {selectedMeta ? selectedMeta.label : "Polecane artykuły warsztatowe"}
              </h2>
              <p className="text-xs text-slate-500">
                {selectedCategory === "gotowe-printy"
                  ? "Zabawki użytkowe — praktyczne printy na co dzień, bez ozdób i litofanów."
                  : selectedMeta
                    ? selectedMeta.hint
                    : "Dostawa w 24h z magazynu Drukstacja"}
              </p>
            </div>
            <Link
              href="/"
              className="text-xs font-bold text-[#EF4444] hover:text-red-700 transition"
            >
              Potrzebujesz wydruku na wymiar? Wycena 3D →
            </Link>
          </div>

          <div
            className="flex flex-wrap gap-2 mb-6"
            role="tablist"
            aria-label="Kategorie sklepu"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!selectedCategory}
              data-shop-category="all"
              onClick={() => selectCategory(null)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                !selectedCategory
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              Wszystkie
              <span className={`ml-1.5 font-semibold ${!selectedCategory ? "text-white/70" : "text-slate-400"}`}>
                {products.length}
              </span>
            </button>
            {categories.map((cat) => {
              const active = selectedCategory === cat.slug;
              return (
                <button
                  key={cat.slug}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-shop-category={cat.slug}
                  title={cat.hint}
                  onClick={() => selectCategory(cat.slug)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                    active
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  {cat.label}
                  <span className={`ml-1.5 font-semibold ${active ? "text-white/70" : "text-slate-400"}`}>
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>

          {catalogState === "loading" ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
              Ładowanie katalogu z magazynu…
            </div>
          ) : catalogState === "error" ? (
            <div className="rounded-2xl border border-dashed border-red-200 bg-red-50/60 p-12 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-800">Nie udało się wczytać katalogu.</p>
              <p className="text-xs text-slate-500">Spróbuj odświeżyć stronę za chwilę.</p>
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
              Katalog jest chwilowo pusty.
            </div>
          ) : visibleProducts.length === 0 ? (
            <div
              data-shop-empty-category={selectedCategory || "all"}
              className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center space-y-2"
            >
              <p className="text-sm font-semibold text-slate-800">{emptyCopy?.title}</p>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">{emptyCopy?.body}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {visibleProducts.map((prod) => {
                const available = productPurchasable(prod);
                const price = Number(prod.price || 0);
                return (
                  <div
                    key={prod.id}
                    data-shop-product={prod.sku || prod.id}
                    data-shop-product-category={prod.category || ""}
                    className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="w-full h-36 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-4xl mb-4 overflow-hidden group-hover:scale-105 transition-transform">
                        {prod.image_url ? (
                          <img
                            src={prod.image_url}
                            alt={prod.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{prod.icon || "📦"}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                          {prod.category_label || shopCategoryLabel(prod.category)}
                        </span>
                        {prod.badge ? (
                          <span className="text-[10px] font-bold bg-red-50 text-[#EF4444] px-2 py-0.5 rounded-full border border-red-100">
                            {prod.badge}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mb-1">
                        {prod.name}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-2">
                        {prod.description}
                      </p>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-base font-black text-slate-900">
                          {price.toFixed(2)}
                        </span>
                        <span className="text-xs font-bold text-slate-400 ml-1">
                          {prod.currency || "PLN"}
                        </span>
                        <div className={`text-[10px] font-bold mt-0.5 ${available ? "text-emerald-600" : "text-slate-400"}`}>
                          {available ? `Na stanie · ${prod.stock} szt.` : "Brak na stanie"}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-shop-add={prod.sku || prod.id}
                        disabled={!available || addingId === prod.id}
                        onClick={() => handleAddToCart(prod)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition shadow-sm ${
                          available
                            ? "bg-slate-900 hover:bg-[#EF4444] text-white cursor-pointer"
                            : "bg-slate-200 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        {addingId === prod.id ? "Dodaję…" : available ? "Dodaj +" : "Niedostępny"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onRemoveItem={(removedId) => {
          setCartItems((prev) => prev.filter((it) => String(it.id) !== String(removedId)));
        }}
      />
    </div>
  );
}
