import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function Navbar({
  activePage = "wycena",
  user = null,
  onOpenAuth = () => {},
  cartItems = [],
  onOpenCart = () => {},
}) {
  const router = useRouter();
  const [isGeneratorsOpen, setIsGeneratorsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const generatorsRef = useRef(null);
  const userMenuRef = useRef(null);

  // Click outside to close desktop dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (generatorsRef.current && !generatorsRef.current.contains(event.target)) {
        setIsGeneratorsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsGeneratorsOpen(false);
    setIsUserMenuOpen(false);
  }, [router.asPath]);

  async function handleSignOut() {
    setIsUserMenuOpen(false);
    setIsMobileMenuOpen(false);
    try {
      await supabase.auth.signOut();
      window.location.reload();
    } catch (err) {
      console.error("SignOut error:", err);
    }
  }

  function handleMaterialsClick(e) {
    if (router.pathname === "/") {
      e.preventDefault();
      const el = document.getElementById("materialy");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  const isWycenaActive = activePage === "wycena" || router.pathname === "/";
  const isGeneratoryActive = activePage === "breloki" || router.pathname.startsWith("/breloki");
  const isSklepActive = activePage === "sklep" || router.pathname.startsWith("/sklep");
  const isKontaktActive = activePage === "kontakt" || router.pathname.startsWith("/kontakt");

  const navLink = (active) =>
    `relative px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] rounded-full transition-colors ${
      active
        ? "text-white bg-white/20"
        : "text-white/40 hover:text-white/80 bg-transparent"
    }`;

  return (
    <header className="w-full bg-[#111111] sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between gap-3">
        
        <div className="flex items-center gap-6 lg:gap-10 shrink-0 min-w-0">
          <Link href="/" className="flex items-center shrink-0 group">
            <img
              src="/logo-drukstacja.png?v=2"
              alt="drukstacja"
              className="h-8 sm:h-10 w-auto group-hover:opacity-90 transition-opacity"
            />
          </Link>

          <nav className="hidden lg:flex items-center gap-1" data-site-nav>
            <Link
              href="/"
              aria-current={isWycenaActive ? "page" : undefined}
              data-nav="wycena"
              data-nav-active={isWycenaActive ? "true" : "false"}
              className={navLink(isWycenaActive)}
            >
              Wycena
            </Link>

            {/* 2. Generatory Dropdown */}
            <div className="relative" ref={generatorsRef}>
              <button
                type="button"
                onClick={() => setIsGeneratorsOpen((prev) => !prev)}
                onMouseEnter={() => setIsGeneratorsOpen(true)}
                aria-current={isGeneratoryActive ? "page" : undefined}
                data-nav="generatory"
                data-nav-active={isGeneratoryActive ? "true" : "false"}
                className={`${navLink(isGeneratoryActive)} flex items-center gap-1 cursor-pointer border-0`}
              >
                <span>Generatory</span>
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${
                    isGeneratorsOpen ? "rotate-180 text-white" : "text-white/40"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* DROPDOWN MENU */}
              {isGeneratorsOpen && (
                <div
                  onMouseLeave={() => setIsGeneratorsOpen(false)}
                  className="absolute left-0 mt-2 w-72 bg-white border border-slate-200/90 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="px-3 py-1.5 mb-1 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      Konfiguratory Online
                    </span>
                    <span className="text-[10px] font-bold text-[#EF4444] bg-red-50 px-1.5 py-0.5 rounded">
                      Nowości
                    </span>
                  </div>

                  {/* Generator 1: Breloki 3D */}
                  <Link
                    href="/breloki"
                    onClick={() => setIsGeneratorsOpen(false)}
                    className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-red-50/60 group transition-all"
                  >
                    <div className="w-9 h-9 rounded-xl bg-red-100 text-[#EF4444] flex items-center justify-center font-bold text-base flex-shrink-0 group-hover:scale-105 transition-transform">
                      🏷️
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 group-hover:text-[#EF4444] transition-colors">
                          Stwórz swój brelok 3D
                        </span>
                        <span className="text-[9px] font-extrabold bg-[#EF4444] text-white px-1.5 py-0.2 rounded-full">
                          3D
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        Wektorowanie grafik, napisy i wielokolorowy podgląd
                      </p>
                    </div>
                  </Link>

                  {/* Generator 2: Litofan (Wkrótce) */}
                  <div className="flex items-start gap-3 p-2.5 rounded-xl opacity-60 hover:opacity-80 transition cursor-not-allowed">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-base flex-shrink-0">
                      🖼️
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-700">
                          Litofan ze zdjęcia
                        </span>
                        <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded-full">
                          Wkrótce
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                        Trójwymiarowy płaskorzeźbiony obraz podświetlany LED
                      </p>
                    </div>
                  </div>

                  {/* Generator 3: Tabliczki znamionowe (Wkrótce) */}
                  <div className="flex items-start gap-3 p-2.5 rounded-xl opacity-60 hover:opacity-80 transition cursor-not-allowed">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-base flex-shrink-0">
                      ⚙️
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-700">
                          Tabliczki znamionowe
                        </span>
                        <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded-full">
                          Wkrótce
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                        Przemysłowe tabliczki z numeracją seryjną i kodami QR
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/sklep"
              aria-current={isSklepActive ? "page" : undefined}
              data-nav="sklep"
              data-nav-active={isSklepActive ? "true" : "false"}
              className={navLink(isSklepActive)}
            >
              Sklep
            </Link>
            <Link
              href="/kontakt"
              aria-current={isKontaktActive ? "page" : undefined}
              data-nav="kontakt"
              data-nav-active={isKontaktActive ? "true" : "false"}
              className={navLink(isKontaktActive)}
            >
              Kontakt
            </Link>
            <Link
              href="/#materialy"
              onClick={handleMaterialsClick}
              data-nav="katalog"
              className={navLink(false)}
            >
              Katalog
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition relative cursor-pointer"
            title="Otwórz koszyk"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            {cartItems.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#EF4444] text-white text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-md animate-pulse">
                {cartItems.length}
              </span>
            )}
          </button>

          {/* PANEL KLIENTA Z ROZWIJANYM MENU */}
          {user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold text-white hover:bg-white/15 transition cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100 shrink-0" />
                <span className="truncate max-w-[120px] hidden sm:inline">{user.email.split("@")[0]}</span>
                <svg
                  className={`w-3.5 h-3.5 text-white/50 transition-transform ${
                    isUserMenuOpen ? "rotate-180 text-white" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">
                      Zalogowano jako
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate block">
                      {user.email}
                    </span>
                  </div>
                  <Link
                    href="/orders"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                  >
                    <span>📦</span>
                    <span>Moje zlecenia</span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 transition cursor-pointer border-t border-slate-100 mt-1"
                  >
                    <span>🚪</span>
                    <span>Wyloguj</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="text-[11px] font-semibold uppercase tracking-[0.14em] px-4 py-2 rounded-full bg-white text-neutral-900 hover:bg-neutral-100 transition cursor-pointer"
            >
              Zaloguj
            </button>
          )}

          {/* HAMBURGER BUTTON (MOBILE) */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Menu mobilne"
          >
            {isMobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* MOBILE DRAWER / MENU */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-white/10 bg-[#111111] px-4 py-4 space-y-3">
          <div className="space-y-1">
            <Link
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-current={isWycenaActive ? "page" : undefined}
              data-nav="wycena"
              data-nav-active={isWycenaActive ? "true" : "false"}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                isWycenaActive
                  ? "bg-white/20 text-white"
                  : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span>⚡</span>
              <span>Wycena druku 3D</span>
            </Link>

            {/* Generatory section */}
            <div className="pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 px-3.5 block mb-1">
                Generatory 3D
              </span>
              <Link
                href="/breloki"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                  isGeneratoryActive
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span>🏷️</span>
                  <span>Stwórz swój brelok 3D</span>
                </div>
                <span className="text-[9px] font-bold bg-[#EF4444] text-white px-1.5 py-0.5 rounded-full">
                  3D
                </span>
              </Link>

              <div className="flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 opacity-60">
                <div className="flex items-center gap-2.5">
                  <span>🖼️</span>
                  <span>Litofan ze zdjęcia</span>
                </div>
                <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                  Wkrótce
                </span>
              </div>

              <div className="flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 opacity-60">
                <div className="flex items-center gap-2.5">
                  <span>⚙️</span>
                  <span>Tabliczki znamionowe</span>
                </div>
                <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                  Wkrótce
                </span>
              </div>
            </div>

            {/* Pozostałe linki */}
            <div className="pt-2 border-t border-white/10 space-y-1">
              <Link
                href="/sklep"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                  isSklepActive
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>🛒</span>
                <span>Sklep & Akcesoria</span>
              </Link>

              <Link
                href="/kontakt"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                  isKontaktActive
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>💬</span>
                <span>Kontakt & Pomoc</span>
              </Link>

              <Link
                href="/#materialy"
                onClick={(e) => {
                  setIsMobileMenuOpen(false);
                  handleMaterialsClick(e);
                }}
                data-nav="katalog"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-white/55 hover:bg-white/5 hover:text-white transition"
              >
                <span>🧪</span>
                <span>Katalog materiałów</span>
              </Link>
            </div>
          </div>

          {/* Panel logowania w menu mobilnym */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between">
            {user ? (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-white/80">{user.email}</span>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-xs font-bold text-red-500 px-3 py-1.5 rounded-lg bg-red-50"
                >
                  Wyloguj
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenAuth();
                }}
                className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold text-center"
              >
                Zaloguj się do Drukstacja
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
