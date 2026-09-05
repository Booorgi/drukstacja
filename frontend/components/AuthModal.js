import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AuthModal({ isOpen, onClose, onLoginSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  if (!isOpen) return null;

  async function handleAuth(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);

    try {
      if (isSignUp) {
        // Rejestracja nowego konta
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;

        // Jeśli weryfikacja e-mail jest wyłączona, od razu mamy sesję/usera
        if (data.user) {
          if (onLoginSuccess) onLoginSuccess(data.user);
          onClose();
        }
      } else {
        // Logowanie istniejącego użytkownika
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (onLoginSuccess) onLoginSuccess(data.user);
        onClose();
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
      });
      if (error) throw error;
    } catch (err) {
      setAuthError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md p-8 rounded-2xl bg-[#0E1524] border border-[#24324A] shadow-2xl text-slate-100">
        
        {/* Przycisk zamknięcia */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-mono cursor-pointer"
        >
          ✕
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex w-10 h-10 rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF]/30 items-center justify-center text-[#00E5FF] font-bold text-xl mb-3 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
            D
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white font-tech">
            {isSignUp ? "ZAŁÓŻ KONTO KLIENTA" : "LOGOWANIE DO DRUKSTACJA"}
          </h2>
          <p className="text-xs text-[#94A3B8] font-mono mt-1">
            Dostęp do wycen, historii modeli CAD i statusu farmy
          </p>
        </div>

        {/* Błędy */}
        {authError && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-xs font-mono">
            {authError}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase text-[#94A3B8] mb-1">
              Adres E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="twoj@email.pl"
              className="w-full bg-[#0B0F17] border border-[#24324A] rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-[#00E5FF] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-[#94A3B8] mb-1">
              Hasło
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#0B0F17] border border-[#24324A] rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-[#00E5FF] transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-[#00E5FF] to-[#2563EB] text-[#0B0F17] font-bold text-sm uppercase tracking-wider rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.25)] hover:opacity-95 transition cursor-pointer disabled:opacity-50"
          >
            {loading ? "Przetwarzanie..." : isSignUp ? "Zarejestruj się" : "Zaloguj się"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-[1px] bg-[#24324A] flex-1" />
          <span className="text-[10px] font-mono text-[#94A3B8]">LUB</span>
          <div className="h-[1px] bg-[#24324A] flex-1" />
        </div>

        {/* Logowanie przez Google */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full py-2.5 px-4 bg-[#0B0F17] border border-[#24324A] hover:border-[#00E5FF] text-white text-xs font-mono rounded-xl transition flex items-center justify-center gap-3 cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          Kontynuuj z Google
        </button>

        {/* Przełącznik trybu */}
        <div className="mt-6 text-center text-xs text-[#94A3B8]">
          {isSignUp ? (
            <span>
              Masz już konto?{" "}
              <button
                type="button"
                onClick={() => { setIsSignUp(false); setAuthError(null); }}
                className="text-[#00E5FF] hover:underline font-semibold cursor-pointer"
              >
                Zaloguj się
              </button>
            </span>
          ) : (
            <span>
              Nie masz konta?{" "}
              <button
                type="button"
                onClick={() => { setIsSignUp(true); setAuthError(null); }}
                className="text-[#00E5FF] hover:underline font-semibold cursor-pointer"
              >
                Utwórz konto
              </button>
            </span>
          )}
        </div>

      </div>
    </div>
  );
}