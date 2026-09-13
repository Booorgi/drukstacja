import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Navbar from "../components/Navbar";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import CheckoutAddressForm from "../components/CheckoutAddressForm";
import { supabase } from "../lib/supabaseClient";
import { fetchCartOrders } from "../lib/ordersApi";
import { createCheckout } from "../lib/checkoutApi";
import { cartLineSubtitle, isShopSkuLine } from "../lib/orderLine";

export default function CheckoutPage() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) {
        loadCart();
      } else {
        setLoading(false);
        setIsAuthOpen(true);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) loadCart();
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadCart() {
    setLoading(true);
    try {
      const items = await fetchCartOrders();
      setCartItems(items);
    } catch (err) {
      console.warn("Błąd koszyka:", err);
    }
    setLoading(false);
  }

  const total = cartItems.reduce((acc, item) => acc + (parseFloat(item.total_price) || 0), 0);

  async function handleCheckout(address) {
    setError("");
    setSubmitting(true);
    try {
      const result = await createCheckout(address);
      if (!result?.url) throw new Error("Brak adresu sesji Stripe.");
      window.location.assign(result.url);
    } catch (err) {
      setError(err?.message || "Nie udało się rozpocząć płatności.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <Head>
        <title>Kasa — Drukstacja</title>
      </Head>
      <Navbar
        activePage="sklep"
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        cartItems={cartItems}
        onOpenCart={() => setIsCartOpen(true)}
      />

      <main className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        <Link href="/sklep" className="text-xs font-bold text-slate-500 hover:text-slate-800">
          ← Wróć do sklepu
        </Link>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mt-3">Kasa</h1>
        <p className="text-sm text-slate-500 mt-1">
          Podaj adres dostawy, a następnie opłać zamówienie w Stripe (PLN).
        </p>

        {loading ? (
          <p className="mt-10 text-sm text-slate-500">Ładowanie koszyka…</p>
        ) : cartItems.length === 0 ? (
          <div className="mt-10 p-8 rounded-3xl bg-white border border-slate-200 text-center space-y-3">
            <p className="font-bold">Koszyk jest pusty</p>
            <p className="text-sm text-slate-500">Dodaj model, brelok albo produkt ze sklepu.</p>
            <Link href="/" className="inline-block text-xs font-bold uppercase tracking-wider text-[#EF4444]">
              Przejdź do wyceniarki
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    {isShopSkuLine(item) && (
                      <span className="text-[10px] font-extrabold uppercase text-[#EF4444] block">Sklep</span>
                    )}
                    <span className="font-bold block truncate">{item.file_name}</span>
                    <span className="text-xs text-slate-500">{cartLineSubtitle(item)}</span>
                  </div>
                  <span className="font-black whitespace-nowrap">
                    {parseFloat(item.total_price || 0).toFixed(2)} zł
                  </span>
                </div>
              ))}
              <div className="pt-3 border-t border-slate-100 flex justify-between text-sm">
                <span className="text-slate-500">Wysyłka (placeholder)</span>
                <span>0.00 PLN</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-slate-500">Razem</span>
                <span className="text-2xl font-black">{total.toFixed(2)} PLN</span>
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 p-5">
              {total < 30 ? (
                <p className="text-sm text-amber-700">
                  Minimalna wartość zamówienia to 30.00 PLN.
                </p>
              ) : (
                <CheckoutAddressForm
                  onSubmit={handleCheckout}
                  submitting={submitting}
                  error={error}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={() => {
          setIsAuthOpen(false);
          loadCart();
        }}
      />
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
