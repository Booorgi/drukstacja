import Link from "next/link";

const TILES = [
  {
    id: "wycena",
    href: "/#configurator",
    title: "Wyceń druk",
    hint: "Studio",
    description: "Wgraj model, dobierz filament i warstwę — cena od razu.",
    featured: true,
  },
  {
    id: "sklep",
    href: "/sklep",
    title: "Sklep",
    hint: "Katalog",
    description: "Gotowe printy, akcesoria i materiały z magazynu.",
    featured: false,
  },
  {
    id: "generatory",
    href: "/breloki",
    title: "Generatory",
    hint: "Breloki 3D",
    description: "Brelok z grafiką albo napisem. Kolejne narzędzia wkrótce.",
    featured: false,
  },
];

function TileIcon({ id }) {
  const common = "h-5 w-5";
  if (id === "wycena") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 4.5h7.2L19 9.3V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 19V6a1.5 1.5 0 0 1 1-1.5Z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path d="M14 4.5V9h4.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M9 13.5h6M9 16.5h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "sklep") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 9h14l-1 11H6L5 9Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9 9V7a3 3 0 0 1 6 0v2"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13.5 4.5h6v6L10.8 19.2a2.1 2.1 0 0 1-3 0L4.8 16.2a2.1 2.1 0 0 1 0-3L13.5 4.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="16.2" cy="7.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function scrollToHash(hash) {
  const el = document.getElementById(hash);
  if (!el) return;
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

export default function HomeHubTiles() {
  return (
    <section
      data-home-hub
      aria-labelledby="home-hub-heading"
      className="relative bg-[#E2E2E2]"
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-4 sm:pb-5">
        <div
          data-home-hub-intro
          className="rounded-2xl bg-white/70 border border-white/80 px-5 sm:px-6 py-5 sm:py-6"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
            drukstacja
          </p>
          <h2
            id="home-hub-heading"
            className="mt-1.5 text-2xl sm:text-[1.75rem] font-semibold tracking-tight text-neutral-900"
          >
            Druk 3D i breloki — wycena od razu
          </h2>
          <p className="mt-2 max-w-2xl text-sm sm:text-[15px] leading-relaxed text-neutral-600">
            Wgraj model albo zdjęcie. Podgląd i cena są w jednym miejscu — bez czekania na maila.
          </p>
        </div>

        <div className="mt-3 sm:mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {TILES.map((tile) => (
            <Link
              key={tile.id}
              href={tile.href}
              data-home-hub-tile={tile.id}
              onClick={(event) => {
                if (tile.id !== "wycena") return;
                if (typeof window === "undefined") return;
                if (window.location.pathname !== "/") return;
                event.preventDefault();
                scrollToHash("configurator");
              }}
              className={`group rounded-2xl p-5 sm:p-6 border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D2A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E2E2E2] ${
                tile.featured
                  ? "bg-[#111111] text-white border-[#111111] hover:bg-[#1a1a1a]"
                  : "bg-white text-neutral-900 border-white/80 hover:border-neutral-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                    tile.featured
                      ? "bg-white/10 text-white"
                      : "bg-neutral-100 text-neutral-800"
                  }`}
                >
                  <TileIcon id={tile.id} />
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    tile.featured ? "text-white/45" : "text-neutral-400"
                  }`}
                >
                  {tile.hint}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">
                {tile.title}
                {tile.featured ? (
                  <span className="text-[#E11D2A]">.</span>
                ) : null}
              </h3>
              <p
                className={`mt-1.5 text-sm leading-relaxed ${
                  tile.featured ? "text-white/70" : "text-neutral-600"
                }`}
              >
                {tile.description}
              </p>
              <span
                className={`mt-4 inline-flex items-center gap-1 text-xs font-semibold ${
                  tile.featured ? "text-white/80" : "text-neutral-800"
                }`}
              >
                Otwórz
                <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 10h10M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
