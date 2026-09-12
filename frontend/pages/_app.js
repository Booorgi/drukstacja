import Head from "next/head";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="180x180" href="/icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
        {/* Plain CSS: Tailwind CDN never emits bottom-[var(--…)] and .relative
            beats an unapplied globals.css rule. Keep the rail in the stage row. */}
        <style>{`
          .studio-surface { display: flex; flex-direction: column; }
          .studio-stage { position: relative; min-height: 420px; }
          @media (min-width: 1024px) {
            .studio-stage { min-height: 500px; }
          }
          @media (min-width: 768px) {
            [data-studio-control-rail] {
              position: absolute !important;
              left: 0.75rem !important;
              top: 0.75rem !important;
              bottom: 0.75rem !important;
              z-index: 20 !important;
              display: flex !important;
              align-items: center;
              justify-content: center;
              pointer-events: none;
              padding: 0 !important;
              transform: none !important;
            }
            [data-studio-control-rail-frame] {
              pointer-events: auto;
              max-height: 100%;
            }
          }
          [data-studio-quote-bar] {
            position: sticky;
            bottom: 0;
            z-index: 40;
            flex-shrink: 0;
          }
        `}</style>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
