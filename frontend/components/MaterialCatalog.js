import React, { useState, useMemo } from "react";

export const ENGINEERING_MATERIALS = [
  {
    id: "pla",
    configId: "PLA_STANDARD",
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
    configId: "PETG_TOUGH",
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
    id: "pctg",
    configId: "PCTG_PRO",
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
    configId: "ASA_UV",
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
    configId: "ABS_INDUSTRY",
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
    configId: "PA12_CF15",
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
    id: "tpu_95a",
    configId: "TPU_FLEX",
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
    configId: null,
    name: "PC",
    chemicalName: "Polycarbonate (Poliwęglan)",
    status: "coming_soon",
    statusBadge: { text: "WKRÓTCE", type: "warning" },
    categories: ["coming_soon", "high_temp", "outdoor_uv"],
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
    id: "iglidur",
    configId: null,
    name: "Iglidur® J260",
    chemicalName: "Polimer trybologiczny samosmarujący (Igus)",
    status: "coming_soon",
    statusBadge: { text: "ŚLIZGOWY", type: "sliding" },
    categories: ["coming_soon", "sliding"],
    desc: "Specjalistyczny kompozyt trybologiczny opracowany przez igus®. Posiada wbudowane cząstki smarne, umożliwiając bezobsługową pracę łożysk i prowadnic bez grama oleju.",
    specs: {
      hdt: "~85°C",
      uv: "Średnia",
      strength: "Odporny na ścieranie",
      cost: "Premium",
    },
    tags: ["Łożyska ślizgowe", "Tuleje", "Koła zębate", "Prowadnice", "Bezsmarowe"],
  },
  {
    id: "pom",
    configId: null,
    name: "POM",
    chemicalName: "Polyoxymethylene (Poliacetal)",
    status: "coming_soon",
    statusBadge: { text: "WKRÓTCE", type: "warning" },
    categories: ["coming_soon", "sliding"],
    desc: "Tworzywo o znakomitych właściwościach ślizgowych, wysokiej sprężystości powrotnej i stabilności wymiarowej. Klasyczny wybór na koła zębate i precyzyjne zatrzaski.",
    specs: {
      hdt: "~95°C",
      uv: "Umiarkowana",
      strength: "Wysoka sztywność",
      cost: "Wysoki",
    },
    tags: ["Koła zębate", "Przekładnie", "Zatrzaski sprężyste", "Mechanika precyzyjna"],
  },
  {
    id: "pp",
    configId: "PP_TECH",
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
  { id: "coming_soon", label: "Wkrótce" },
  { id: "sliding", label: "Ślizgowe" },
  { id: "high_temp", label: "Wysoka temp." },
  { id: "outdoor_uv", label: "Zewnętrzne / UV" },
];

function getBadgeStyle(type) {
  switch (type) {
    case "danger":
      return "bg-black/5 text-neutral-700 border-black/10";
    case "composite":
      return "bg-black/5 text-neutral-700 border-black/10";
    case "sliding":
      return "bg-black/5 text-neutral-700 border-black/10";
    case "warning":
      return "bg-black/5 text-neutral-600 border-black/10";
    case "available":
    default:
      return "bg-black/5 text-neutral-700 border-black/10";
  }
}

export default function MaterialCatalog({ onSelectMaterial }) {
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredMaterials = useMemo(() => {
    if (activeCategory === "all") return ENGINEERING_MATERIALS;
    if (activeCategory === "available") {
      return ENGINEERING_MATERIALS.filter((m) => m.status === "available");
    }
    if (activeCategory === "coming_soon") {
      return ENGINEERING_MATERIALS.filter((m) => m.status === "coming_soon");
    }
    return ENGINEERING_MATERIALS.filter((m) => m.categories.includes(activeCategory));
  }, [activeCategory]);

  const handleChooseMaterial = (mat) => {
    if (mat.configId && onSelectMaterial) {
      onSelectMaterial(mat.configId);
    }
    const el = document.getElementById("configurator") || document.getElementById("quote-configurator");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleInquireMaterial = (mat) => {
    const el = document.getElementById("configurator") || document.getElementById("quote-configurator");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <section className="w-full pt-6 pb-6 space-y-8">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
          Materiały
        </p>
        <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900 tracking-tight">
          Czym drukujemy?
        </h2>
        <p className="text-base md:text-lg text-neutral-600 max-w-3xl leading-relaxed">
          Oferujemy szeroki wybór materiałów FDM — od taniego PLA po specjalistyczne kompozyty z włóknem
          węglowym i materiały samogasnące. Filtruj według zastosowania i znajdź idealny materiał dla swojego
          projektu.
        </p>
      </div>

      {/* 2. FILTRY KATEGORII (POZIOME PILLE) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {CATEGORY_FILTERS.map((cat) => {
          const isActive = activeCategory === cat.id;
          const count =
            cat.id === "all"
              ? ENGINEERING_MATERIALS.length
              : cat.id === "available"
              ? ENGINEERING_MATERIALS.filter((m) => m.status === "available").length
              : cat.id === "coming_soon"
              ? ENGINEERING_MATERIALS.filter((m) => m.status === "coming_soon").length
              : ENGINEERING_MATERIALS.filter((m) => m.categories.includes(cat.id)).length;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? "bg-[#111111] text-white"
                  : "bg-black/5 text-neutral-600 hover:bg-black/10 hover:text-neutral-900"
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-md font-semibold ${
                  isActive ? "bg-white/20 text-white" : "bg-black/5 text-neutral-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. KARTY MATERIAŁÓW (GRID 3 KOLUMNY) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMaterials.map((mat) => {
          const badgeClass = getBadgeStyle(mat.statusBadge.type);

          return (
            <div
              key={mat.id}
              className="bg-white/50 rounded-3xl p-6 border border-black/5 hover:bg-white/80 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Nagłówek karty */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-2xl font-semibold text-neutral-900 tracking-tight">
                      {mat.name}
                    </h3>
                    <span className="text-xs text-neutral-500 font-medium block mt-0.5">
                      {mat.chemicalName}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.8 rounded-full text-[10px] font-extrabold uppercase tracking-wider border flex-shrink-0 ${badgeClass}`}
                  >
                    {mat.statusBadge.text}
                  </span>
                </div>

                {/* Zwięzły opis inżynieryjny */}
                <p className="text-sm text-neutral-600 leading-relaxed min-h-[64px]">
                  {mat.desc}
                </p>

                <div className="bg-black/[0.04] p-4 rounded-2xl grid grid-cols-2 gap-3 my-4">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Temp. HDT
                    </div>
                    <div className="text-sm font-semibold text-neutral-800 flex items-center gap-1">
                      <span>🔥</span>
                      <span>{mat.specs.hdt}</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Odporność UV
                    </div>
                    <div className="text-sm font-semibold text-neutral-800 flex items-center gap-1">
                      <span>☀️</span>
                      <span>{mat.specs.uv}</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Wytrzymałość
                    </div>
                    <div className="text-sm font-semibold text-neutral-800 flex items-center gap-1 truncate">
                      <span>💪</span>
                      <span className="truncate">{mat.specs.strength}</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Koszt
                    </div>
                    <div className="text-sm font-semibold text-neutral-800 flex items-center gap-1">
                      <span>💰</span>
                      <span>{mat.specs.cost}</span>
                    </div>
                  </div>
                </div>

                {/* Tagi zastosowań na dole karty */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {mat.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-full bg-black/5 text-neutral-600 text-xs font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Przycisk akcji: Wybierz do wyceny */}
              <div className="pt-4 mt-2 border-t border-black/5">
                {mat.configId ? (
                  <button
                    type="button"
                    onClick={() => handleChooseMaterial(mat)}
                    className="w-full py-3 px-4 rounded-full text-sm font-semibold transition-all flex items-center justify-center gap-2 bg-[#111111] text-white hover:bg-black cursor-pointer"
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
                    onClick={() => handleInquireMaterial(mat)}
                    className="w-full py-3 px-4 rounded-full text-sm font-semibold transition-all flex items-center justify-center gap-2 bg-black/5 text-neutral-700 hover:bg-black/10 cursor-pointer"
                  >
                    <span>Zapytaj o wycenę (RFQ)</span>
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
