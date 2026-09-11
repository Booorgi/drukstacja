import React from "react";

function SpecTile({ label, value }) {
  return (
    <div className="rounded-xl bg-white/12 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">{label}</p>
      <p className="text-sm font-medium text-white mt-0.5 leading-snug">{value}</p>
    </div>
  );
}

export default function StudioPrintSettings({
  isRfq = false,
  matConfig,
  recommendedApps = [],
  chemicalResistance = "",
  rfqSubmitted,
  rfqSubmitting,
  rfqName,
  setRfqName,
  rfqEmail,
  setRfqEmail,
  rfqPhone,
  setRfqPhone,
  rfqQuantity,
  setRfqQuantity,
  rfqNotes,
  setRfqNotes,
  onSubmitRfq,
  onResetFile,
  selectedFileName,
  userEmail,
}) {
  if (isRfq) {
    return (
      <div className="rounded-3xl bg-[#2A2A2A] text-white p-5 space-y-4 w-full">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
          Wycena inżynierska
        </p>
        {rfqSubmitted ? (
          <div className="space-y-3">
            <p className="text-base font-medium">Zapytanie zostało przesłane.</p>
            <p className="text-sm text-white/70">Oferta w ciągu 24h na {rfqEmail || userEmail}.</p>
            <button
              type="button"
              onClick={onResetFile}
              className="px-5 py-2.5 rounded-full bg-white text-neutral-900 text-sm font-semibold"
            >
              Kolejny plik
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmitRfq} className="space-y-3">
            <p className="text-sm text-white/75">
              Zweryfikujemy <strong className="text-white">{selectedFileName}</strong> i wrócimy z wyceną.
            </p>
            <input
              type="text"
              value={rfqName}
              onChange={(e) => setRfqName(e.target.value)}
              placeholder="Imię / firma"
              className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/40 focus:outline-none"
            />
            <input
              type="email"
              required
              value={rfqEmail}
              onChange={(e) => setRfqEmail(e.target.value)}
              placeholder="E-mail *"
              className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/40 focus:outline-none"
            />
            <input
              type="tel"
              value={rfqPhone}
              onChange={(e) => setRfqPhone(e.target.value)}
              placeholder="Telefon"
              className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/40 focus:outline-none"
            />
            <input
              type="number"
              min="1"
              value={rfqQuantity}
              onChange={(e) => setRfqQuantity(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white focus:outline-none"
            />
            <textarea
              rows={3}
              value={rfqNotes}
              onChange={(e) => setRfqNotes(e.target.value)}
              placeholder="Materiał, tolerancje, termin…"
              className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/40 focus:outline-none resize-none"
            />
            <button
              type="submit"
              disabled={rfqSubmitting}
              className="w-full py-3 rounded-full bg-white text-neutral-900 text-sm font-semibold disabled:opacity-50"
            >
              {rfqSubmitting ? "Wysyłanie…" : "Wyślij do wyceny"}
            </button>
          </form>
        )}
      </div>
    );
  }

  const groupLabel =
    matConfig?.group === "tech"
      ? "Techniczny"
      : matConfig?.group === "composite"
      ? "Kompozyt"
      : matConfig?.group === "flex"
      ? "Elastyczny"
      : "Standard";

  return (
    <div className="rounded-3xl bg-[#2A2A2A] text-white p-5 space-y-4 w-full">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Wybrany materiał</p>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">{matConfig?.name}</h2>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SpecTile label="Cena" value={`${(matConfig?.pricePerCm3 || 0).toFixed(2)} zł/cm³`} />
        <SpecTile label="Gęstość" value={`${matConfig?.density || 1.24} g/cm³`} />
        <SpecTile label="HDT" value={matConfig?.hdt || "55°C"} />
        <SpecTile label="UV" value={matConfig?.uvResistance || "Średnia"} />
      </div>

      <p className="text-sm text-white/85 leading-relaxed">{matConfig?.desc}</p>

      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1.5 rounded-full bg-white/10 text-sm">{groupLabel}</span>
        <span className="px-3 py-1.5 rounded-full bg-white/10 text-sm">FDM</span>
        {matConfig?.badge ? (
          <span className="px-3 py-1.5 rounded-full bg-white text-neutral-900 text-sm font-medium">
            {matConfig.badge}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SpecTile label="Sztywność" value={matConfig?.tensileStrength || "Wysoka"} />
        <SpecTile label="Chemia" value={chemicalResistance} />
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60 mb-2">Zastosowania</p>
        <div className="flex flex-wrap gap-2">
          {recommendedApps.slice(0, 3).map((app) => (
            <div key={app} className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/90">
              {app}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
