import React, { useMemo, useState } from "react";
import { Flame, Sun, Shield, Coins, X } from "lucide-react";

export const ENGINEERING_MATERIALS = [
  {
    id: "pla",
    configId: "PLA_STANDARD",
    featured: true,
    name: "PLA",
    chemicalName: "Polylactic Acid",
    status: "available",
    statusBadge: { text: "DOSTĘPNY", type: "available" },
    categories: ["available"],
    desc: "Najpopularniejszy termoplastyczny polimer biodegradowalny. Zapewnia znakomitą dokładność wymiarową, gładkie ścianki bez skurczu oraz idealny stosunek jakości do ceny.",
    specs: {
      hdt: "~55°C",
      uv: "Umiarkowana",
      strength: "Dobra",
      cost: "Najniższy",
    },
    tags: ["Prototypy", "Modele", "Dekoracje", "Wnętrze", "Obudowy"],
  },
  {
    id: "petg",
    configId: "PETG",
    name: "PETG",
    chemicalName: "Polyethylene Terephthalate Glycol",
    status: "available",
    statusBadge: { text: "DOSTĘPNY", type: "available" },
    categories: ["available", "outdoor_uv"],
    desc: "Trwały kopoliester o doskonałej spajalności warstw i odporności chemicznej. Łączy łatwość druku z odpornością na wilgoć, uderzenia i warunki atmosferyczne.",
    specs: {
      hdt: "~75°C",
      uv: "Dobra",
      strength: "Bardzo wysoka",
      cost: "Niski",
    },
    tags: ["Uchwyty", "Zastosowania wodne", "Części mechaniczne", "Pojemniki"],
  },
  {
    id: "petg_cf",
    configId: "PETG_CF",
    name: "PETG CF",
    chemicalName: "PETG + Carbon Fiber",
    status: "available",
    statusBadge: { text: "KOMPOZYT", type: "composite" },
    categories: ["available", "high_temp"],
    desc: "PETG wzmocniony włóknem węglowym. Sztywniejszy od zwykłego PETG, zachowuje odporność chemiczną i wilgociową.",
    specs: {
      hdt: "~78°C",
      uv: "Dobra",
      strength: "Wysoka sztywność",
      cost: "Średni",
    },
    tags: ["Uchwyty", "Osłony", "Części mechaniczne", "Kompozyt"],
  },
  {
    id: "pctg",
    configId: "PCTG",
    name: "PCTG",
    chemicalName: "Polycyclohexylenedimethylene Terephthalate Glycol",
    status: "available",
    statusBadge: { text: "DOSTĘPNY", type: "available" },
    categories: ["available", "outdoor_uv"],
    desc: "Zaawansowany polimer o kilkukrotnie wyższej udarności niż PET-G. Wyjątkowo odporny na pękanie dynamiczne, czynniki chemiczne i obciążenia cykliczne.",
    specs: {
      hdt: "~76°C",
      uv: "Dobra",
      strength: "Ekstremalna",
      cost: "Średni",
    },
    tags: ["Elementy uderzeniowe", "Osłony ochronne", "Dozowniki", "Przemysł"],
  },
  {
    id: "asa",
    configId: "ASA",
    name: "ASA",
    chemicalName: "Acrylonitrile Styrene Acrylate",
    status: "available",
    statusBadge: { text: "DOSTĘPNY", type: "available" },
    categories: ["available", "high_temp", "outdoor_uv"],
    desc: "Polimer stworzony do ekspozycji na zewnątrz i do automotive. Wyjątkowo odporny na promieniowanie słoneczne UV, deszcz, mróz oraz skrajne wahania temperatur.",
    specs: {
      hdt: "~95°C",
      uv: "Maksymalna (Outdoor)",
      strength: "Bardzo wysoka",
      cost: "Średni",
    },
    tags: ["Motoryzacja", "Zastosowania zewnętrzne", "Obudowy kamer", "Automatyka"],
  },
  {
    id: "abs",
    configId: "ABS",
    name: "ABS",
    chemicalName: "Acrylonitrile Butadiene Styrene",
    status: "available",
    statusBadge: { text: "DOSTĘPNY", type: "available" },
    categories: ["available", "high_temp"],
    desc: "Przemysłowy standard o wysokiej sztywności i twardości. Odporny na uderzenia i podwyższone temperatury; podatny na wygładzanie chemiczne oparami acetonu.",
    specs: {
      hdt: "~90°C",
      uv: "Średnia",
      strength: "Wysoka udarność",
      cost: "Niski",
    },
    tags: ["Części maszyn", "Obudowy elektroniki", "Ramy", "AGD/RTV"],
  },
  {
    id: "abs_gf",
    configId: "ABS_GF",
    name: "ABS GF",
    chemicalName: "ABS + Glass Fiber",
    status: "available",
    statusBadge: { text: "KOMPOZYT", type: "composite" },
    categories: ["available", "high_temp"],
    desc: "ABS z włóknem szklanym — wyższa sztywność i stabilność wymiarowa od standardowego ABS, nadal podatny na wyższe temperatury.",
    specs: {
      hdt: "~95°C",
      uv: "Średnia",
      strength: "Wysoka sztywność",
      cost: "Średni",
    },
    tags: ["Obudowy", "Szablony", "Części konstrukcyjne"],
  },
  {
    id: "abs_fr",
    configId: "ABS_FR",
    name: "ABS FR",
    chemicalName: "Flame Retardant ABS",
    status: "available",
    statusBadge: { text: "TRUDNOPALNY", type: "danger" },
    categories: ["available", "high_temp"],
    desc: "Trudnopalny ABS do obudów elektroniki i elementów narażonych na iskrzenie. Czarny, do zastosowań przemysłowych.",
    specs: {
      hdt: "~90°C",
      uv: "Średnia",
      strength: "Wysoka",
      cost: "Wysoki",
    },
    tags: ["Elektronika", "Obudowy", "Aparatura"],
  },
  {
    id: "petg_fr",
    configId: "PETG_FR",
    name: "PETG FR",
    chemicalName: "Flame Retardant PET-G (Samogasnący)",
    status: "available",
    statusBadge: { text: "UL94 V-0", type: "danger" },
    categories: ["available", "high_temp"],
    desc: "Certyfikowany materiał trudnopalny zgodny ze światową normą UL94 V-0 (gaśnie w <10s bez kapiących kropel). Przeznaczony do urządzeń elektrycznych i szaf sterowniczych.",
    specs: {
      hdt: "~78°C",
      uv: "Dobra",
      strength: "Bardzo wysoka",
      cost: "Średni",
    },
    tags: ["Szafy sterownicze", "Szyny DIN", "Elektronika", "Kolejnictwo", "Atest UL94"],
  },
  {
    id: "pa12_cf",
    configId: "PA12_CF",
    name: "PA12 CF",
    chemicalName: "Polyamide 12 + 15% Carbon Fiber",
    status: "available",
    statusBadge: { text: "KOMPOZYT", type: "composite" },
    categories: ["available", "high_temp", "sliding"],
    desc: "Strukturalny kompozyt nylonu wzmocniony w 15% ciętym włóknem węglowym. Zastępuje stopy aluminium w dronach, robotyce i częściach maszyn o rygorystycznej masie.",
    specs: {
      hdt: "~155°C",
      uv: "Bardzo dobra",
      strength: "Ekstremalna sztywność",
      cost: "Premium",
    },
    tags: ["Części maszyn", "Robotyka", "Motorsport", "Drony", "Uchwyty CNC"],
  },
  {
    id: "pa6_cf",
    configId: "PA6_CF",
    name: "PA 6 CF",
    chemicalName: "Polyamide 6 + Carbon Fiber",
    status: "available",
    statusBadge: { text: "KOMPOZYT", type: "composite" },
    categories: ["available", "high_temp", "sliding"],
    desc: "Nylon PA6 z włóknem węglowym. Wysoka sztywność i odporność termiczna przy niższej cenie niż PA12-CF.",
    specs: {
      hdt: "~150°C",
      uv: "Bardzo dobra",
      strength: "Ekstremalna sztywność",
      cost: "Premium",
    },
    tags: ["Części maszyn", "Robotyka", "Uchwyty", "Kompozyt"],
  },
  {
    id: "easy_pa",
    configId: "EASY_PA",
    name: "Easy PA",
    chemicalName: "Easy-print Polyamide",
    status: "available",
    statusBadge: { text: "DOSTĘPNY", type: "available" },
    categories: ["available", "high_temp"],
    desc: "Łatwiejszy w druku nylon — mniej higroskopijny i mniej kapryśny niż klasyczne PA. Natural i czarny.",
    specs: {
      hdt: "~120°C",
      uv: "Dobra",
      strength: "Wysoka",
      cost: "Średni",
    },
    tags: ["Prototypy techniczne", "Obudowy", "Zawiasy", "Części użytkowe"],
  },
  {
    id: "tpu_95a",
    configId: "TPU_95A",
    name: "TPU 95A",
    chemicalName: "Thermoplastic Polyurethane (Guma)",
    status: "available",
    statusBadge: { text: "DOSTĘPNY", type: "available" },
    categories: ["available", "outdoor_uv"],
    desc: "Elastyczny elastomer poliuretanowy o twardości 95A Shore'a. Znakomicie tłumi drgania, powraca do pierwotnego kształtu i wykazuje wysoką odporność na oleje i ścieranie.",
    specs: {
      hdt: "~60°C",
      uv: "Bardzo dobra",
      strength: "Sprężysta (Guma)",
      cost: "Średni",
    },
    tags: ["Uszczelki", "Odbojniki", "Ochraniacze", "Tłumiki wibracji", "Opony"],
  },
  {
    id: "pc",
    configId: "PC",
    name: "PC",
    chemicalName: "Polycarbonate (Poliwęglan)",
    status: "available",
    statusBadge: { text: "DOSTĘPNY", type: "available" },
    categories: ["available", "high_temp", "outdoor_uv"],
    desc: "Niezwykle odporny mechanicznie i termicznie polimer konstrukcyjny. Wytrzymuje uderzenia udarowe i ciągłą pracę w temperaturze roboczej powyżej 110°C.",
    specs: {
      hdt: "~115°C",
      uv: "Bardzo dobra",
      strength: "Ekstremalna",
      cost: "Wysoki",
    },
    tags: ["Osłony maszyn", "Klosze", "Oprawy oświetleniowe", "Przemysł ciężki"],
  },
  {
    id: "pp",
    configId: "PP",
    name: "PP",
    chemicalName: "Polypropylene (Polipropylen)",
    status: "available",
    statusBadge: { text: "DOSTĘPNY", type: "available" },
    categories: ["available", "outdoor_uv"],
    desc: "Tworzywo o zerowej higroskopijności i niezrównanej odporności na stężone kwasy, ługi i rozpuszczalniki organiczne. Posiada atest do kontaktu z chemią agresywną.",
    specs: {
      hdt: "~85°C",
      uv: "Dobra",
      strength: "Wysoka sprężystość",
      cost: "Średni",
    },
    tags: ["Zbiorniki chemiczne", "Armatura", "Laboratoria", "Zawiasy integralne"],
  },
];

const CATEGORY_FILTERS = [
  { id: "all", label: "Wszystkie" },
  { id: "available", label: "Dostępne teraz" },
  { id: "sliding", label: "Ślizgowe" },
  { id: "high_temp", label: "Wysoka temp." },
  { id: "outdoor_uv", label: "Zewnętrzne / UV" },
];

const SPEC_ROWS = [
  { key: "hdt", label: "Temp. HDT", Icon: Flame },
  { key: "uv", label: "Odporność UV", Icon: Sun },
  { key: "strength", label: "Wytrzymałość", Icon: Shield },
  { key: "cost", label: "Koszt", Icon: Coins },
];

function getBadgeStyle(type) {
  switch (type) {
    case "warning":
      return "bg-zinc-800 text-zinc-400 border-zinc-700";
    default:
      return "bg-zinc-800 text-zinc-300 border-zinc-700";
  }
}

function scrollToConfigurator() {
  const el = document.getElementById("configurator") || document.getElementById("quote-configurator");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function SpecGrid({ specs, className = "" }) {
  return (
    <div className={`bg-zinc-800/80 p-4 rounded-2xl grid grid-cols-2 gap-3 ${className}`}>
      {SPEC_ROWS.map(({ key, label, Icon }) => (
        <div key={key} className="space-y-0.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
          <div className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0 text-[#F97316]" strokeWidth={2} aria-hidden />
            <span className="truncate">{specs[key]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MaterialCatalog({ onSelectMaterial }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [detailsMat, setDetailsMat] = useState(null);

  const filteredMaterials = useMemo(() => {
    if (activeCategory === "all") return ENGINEERING_MATERIALS;
    if (activeCategory === "available") {
      return ENGINEERING_MATERIALS.filter((m) => m.status === "available");
    }
    return ENGINEERING_MATERIALS.filter((m) => m.categories.includes(activeCategory));
  }, [activeCategory]);

  const handleChooseMaterial = (mat) => {
    if (mat.configId && onSelectMaterial) {
      onSelectMaterial(mat.configId);
    }
    scrollToConfigurator();
  };

  const handleInquireMaterial = () => {
    scrollToConfigurator();
  };

  return (
    <section className="w-full pt-6 pb-6 space-y-8">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">Materiały</p>
        <h2 className="text-3xl md:text-4xl font-semibold text-zinc-50 tracking-tight">Czym drukujemy?</h2>
        <p className="text-base md:text-lg text-zinc-400 max-w-3xl leading-relaxed">
          Od PLA na prototypy po kompozyty z włóknem węglowym. Wybierz tworzywo, wróć do konfiguratora — wycena
          przeliczy się od razu.
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {CATEGORY_FILTERS.map((cat) => {
          const isActive = activeCategory === cat.id;
          const count =
            cat.id === "all"
              ? ENGINEERING_MATERIALS.length
              : cat.id === "available"
              ? ENGINEERING_MATERIALS.filter((m) => m.status === "available").length
              : ENGINEERING_MATERIALS.filter((m) => m.categories.includes(cat.id)).length;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? "bg-[#F97316] text-zinc-950"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-md font-semibold ${
                  isActive ? "bg-zinc-950/20 text-zinc-950" : "bg-zinc-900 text-zinc-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMaterials.map((mat) => {
          const badgeClass = getBadgeStyle(mat.statusBadge.type);
          const visibleTags = (mat.tags || []).slice(0, 3);
          const featured = Boolean(mat.featured);

          return (
            <div
              key={mat.id}
              data-material-card={mat.id}
              data-featured={featured ? "true" : "false"}
              className={`rounded-3xl p-6 border transition-all flex flex-col justify-between group bg-zinc-900 ${
                featured
                  ? "border-[#F97316]/45 shadow-[0_12px_32px_rgba(249,115,22,0.08)]"
                  : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-2xl font-semibold text-zinc-50 tracking-tight">{mat.name}</h3>
                    <span className="text-xs text-zinc-500 font-medium block mt-0.5">{mat.chemicalName}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {featured ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#F97316] text-zinc-950">
                        Najczęściej wybierany
                      </span>
                    ) : null}
                    <span
                      className={`px-2.5 py-0.8 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${badgeClass}`}
                    >
                      {mat.statusBadge.text}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-zinc-400 leading-relaxed min-h-[64px]">{mat.desc}</p>

                <SpecGrid specs={mat.specs} className="my-4" />

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {visibleTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setDetailsMat(mat)}
                  className="mt-2 text-xs font-semibold text-zinc-400 hover:text-[#F97316] transition"
                >
                  Więcej parametrów technicznych
                </button>
              </div>

              <div className="pt-4 mt-2 border-t border-zinc-800">
                {mat.configId ? (
                  <button
                    type="button"
                    onClick={() => handleChooseMaterial(mat)}
                    className={`w-full py-3 px-4 rounded-full text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      featured
                        ? "bg-[#F97316] text-zinc-950 hover:bg-[#EA580C]"
                        : "bg-transparent text-zinc-200 ring-1 ring-zinc-600 hover:ring-[#F97316] hover:text-[#F97316]"
                    }`}
                  >
                    <span>Wybierz do wyceny</span>
                    <svg
                      className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleInquireMaterial}
                    className="w-full py-3 px-4 rounded-full text-sm font-semibold transition-all flex items-center justify-center gap-2 bg-transparent text-zinc-300 ring-1 ring-zinc-700 hover:ring-zinc-500 cursor-pointer"
                  >
                    <span>Zapytaj o wycenę (RFQ)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {detailsMat ? (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="material-tech-title"
          data-material-tech-modal
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Zamknij parametry techniczne"
            onClick={() => setDetailsMat(null)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-3xl bg-zinc-900 text-zinc-100 border border-zinc-700 shadow-[0_24px_60px_rgba(0,0,0,0.5)] p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Parametry techniczne
                </p>
                <h3 id="material-tech-title" className="text-xl font-semibold mt-1">
                  {detailsMat.name}
                </h3>
                <p className="text-xs text-zinc-500">{detailsMat.chemicalName}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsMat(null)}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Zamknij"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">{detailsMat.desc}</p>
            <SpecGrid specs={detailsMat.specs} />
            <div className="flex flex-wrap gap-1.5">
              {(detailsMat.tags || []).map((tag) => (
                <span key={tag} className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-medium">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
