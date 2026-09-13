import React, { useState } from "react";

const EMPTY = {
  name: "",
  phone: "",
  street: "",
  postal_code: "",
  city: "",
  country: "PL",
  company: "",
  nip: "",
};

export default function CheckoutAddressForm({
  onSubmit,
  submitting = false,
  error = "",
  submitLabel = "Przejdź do płatności Stripe →",
  initial = null,
}) {
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(initial || {}) }));

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      street: form.street.trim(),
      postal_code: form.postal_code.trim(),
      city: form.city.trim(),
      country: (form.country || "PL").trim().toUpperCase() || "PL",
      company: form.company.trim() || null,
      nip: form.nip.trim() || null,
    };
    await onSubmit(payload);
  }

  const fieldClass =
    "w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#EF4444] focus:bg-white";

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-checkout-form="true">
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#EF4444] block">
          Dane dostawy
        </span>
        <p className="text-xs text-slate-500 mt-0.5">
          Wysyłka na terenie Polski. Kurier i faktury — w kolejnej wersji.
        </p>
      </div>

      <label className="block">
        <span className="text-[11px] font-bold text-slate-600 block mb-1">Imię i nazwisko</span>
        <input
          required
          minLength={2}
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
          className={fieldClass}
          autoComplete="name"
          placeholder="Jan Kowalski"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold text-slate-600 block mb-1">Telefon</span>
        <input
          required
          minLength={7}
          value={form.phone}
          onChange={(e) => setField("phone", e.target.value)}
          className={fieldClass}
          autoComplete="tel"
          inputMode="tel"
          placeholder="500 600 700"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold text-slate-600 block mb-1">Ulica i numer</span>
        <input
          required
          minLength={2}
          value={form.street}
          onChange={(e) => setField("street", e.target.value)}
          className={fieldClass}
          autoComplete="street-address"
          placeholder="ul. Przykładowa 12/3"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-bold text-slate-600 block mb-1">Kod pocztowy</span>
          <input
            required
            minLength={4}
            value={form.postal_code}
            onChange={(e) => setField("postal_code", e.target.value)}
            className={fieldClass}
            autoComplete="postal-code"
            placeholder="00-001"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-slate-600 block mb-1">Miasto</span>
          <input
            required
            minLength={2}
            value={form.city}
            onChange={(e) => setField("city", e.target.value)}
            className={fieldClass}
            autoComplete="address-level2"
            placeholder="Warszawa"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] font-bold text-slate-600 block mb-1">Kraj</span>
        <select
          value={form.country}
          onChange={(e) => setField("country", e.target.value)}
          className={fieldClass}
        >
          <option value="PL">Polska</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-bold text-slate-600 block mb-1">Firma (opcjonalnie)</span>
          <input
            value={form.company}
            onChange={(e) => setField("company", e.target.value)}
            className={fieldClass}
            autoComplete="organization"
            placeholder="Nazwa firmy"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-slate-600 block mb-1">NIP (opcjonalnie)</span>
          <input
            value={form.nip}
            onChange={(e) => setField("nip", e.target.value)}
            className={fieldClass}
            inputMode="numeric"
            placeholder="0000000000"
          />
        </label>
      </div>

      {error ? (
        <div className="p-3 rounded-xl bg-red-50 text-[#EF4444] text-xs font-semibold">{error}</div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-4 rounded-full font-bold text-xs uppercase tracking-wider bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-lg shadow-red-500/25 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
      >
        {submitting ? "Łączenie ze Stripe…" : submitLabel}
      </button>
    </form>
  );
}
