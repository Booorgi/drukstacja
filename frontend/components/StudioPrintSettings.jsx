import React, { useEffect, useState } from "react";

function SpecTile({ label, value }) {
  return (
    <div className="rounded-lg bg-white/12 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">{label}</p>
      <p className="text-xs font-medium text-white mt-0.5 leading-snug">{value}</p>
    </div>
  );
}

function MaterialDetails({ matConfig, recommendedApps, chemicalResistance, groupLabel }) {
  return (
    <>
      <p className="text-xs text-white/80 leading-relaxed">{matConfig?.desc}</p>

      <div className="flex flex-wrap gap-1.5">
        <span className="px-2 py-1 rounded-full bg-white/10 text-xs">{groupLabel}</span>
        <span className="px-2 py-1 rounded-full bg-white/10 text-xs">FDM</span>
        {matConfig?.badge ? (
          <span className="px-2 py-1 rounded-full bg-white text-neutral-900 text-xs font-medium">
            {matConfig.badge}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <SpecTile label="Sztywność" value={matConfig?.tensileStrength || "Wysoka"} />
        <SpecTile label="Chemia" value={chemicalResistance} />
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60 mb-1.5">Zastosowania</p>
        <div className="flex flex-wrap gap-1.5">
          {recommendedApps.slice(0, 3).map((app) => (
            <div key={app} className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/90">
              {app}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Right-hand selected-material card.
 * Empty studio stays compact (name + key metrics + badge); full spec is one click away.
 */
export default function StudioPrintSettings({
  isRfq = false,
  compact = false,
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
  const [detailsOpen, setDetailsOpen] = useState(!compact);

  useEffect(() => {
    setDetailsOpen(!compact);
  }, [compact]);

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

  const showDetails = !compact || detailsOpen;
  const panelState = compact && !detailsOpen ? "compact" : "full";

  return (
    <div
      data-material-panel={panelState}
      data-compact={compact ? "true" : "false"}
      className={`rounded-2xl bg-[#2A2A2A] text-white w-full ${
        compact && !detailsOpen ? "p-3 space-y-2" : "p-3.5 space-y-2.5"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">Wybrany materiał</p>
          <h2 className="text-lg font-semibold tracking-tight mt-0.5">{matConfig?.name}</h2>
        </div>
        {compact && !detailsOpen && matConfig?.badge ? (
          <span className="shrink-0 mt-0.5 px-2 py-1 rounded-full bg-white text-neutral-900 text-xs font-medium">
            {matConfig.badge}
          </span>
        ) : null}
      </div>

      <div className={`grid gap-1.5 ${showDetails ? "grid-cols-2" : "grid-cols-3"}`}>
        <SpecTile label="Cena" value={`${(matConfig?.pricePerCm3 || 0).toFixed(2)} zł/cm³`} />
        <SpecTile label="Gęstość" value={`${matConfig?.density || 1.24} g/cm³`} />
        <SpecTile label="HDT" value={matConfig?.hdt || "55°C"} />
        {showDetails ? <SpecTile label="UV" value={matConfig?.uvResistance || "Średnia"} /> : null}
      </div>

      {showDetails ? (
        <div id="material-details" data-material-details>
          <MaterialDetails
            matConfig={matConfig}
            recommendedApps={recommendedApps}
            chemicalResistance={chemicalResistance}
            groupLabel={groupLabel}
          />
        </div>
      ) : null}

      {compact ? (
        <button
          type="button"
          data-material-more
          aria-expanded={detailsOpen}
          aria-controls="material-details"
          onClick={() => setDetailsOpen((open) => !open)}
          className="w-full rounded-lg bg-white/8 py-1.5 text-[11px] font-semibold text-white/70 hover:bg-white/12 hover:text-white transition"
        >
          {detailsOpen ? "Mniej" : "Więcej"}
        </button>
      ) : null}
    </div>
  );
}
