import React, { useEffect, useRef, useState } from "react";

const POSTER_SRC = "/videos/printer-layers-poster.jpg";
const WEBM_SRC = "/videos/printer-layers-loop.webm";
const MP4_SRC = "/videos/printer-layers-loop.mp4";

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Cinematic FDM marketing band for the homepage.
 * Lazy-loads the loop when near the viewport, ties play/pause + opacity
 * to IntersectionObserver, and falls back to the poster when the user
 * prefers reduced motion. Sits above the studio — never over it.
 */
export default function PrinterLayersBand() {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      const reduced = mq.matches;
      setReduceMotion(reduced);
      if (reduced) {
        setShouldLoad(false);
        const video = videoRef.current;
        if (video) video.pause();
      }
    };
    syncMotion();
    mq.addEventListener("change", syncMotion);

    const section = sectionRef.current;
    if (!section) {
      return () => mq.removeEventListener("change", syncMotion);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;

        if (prefersReducedMotion()) {
          setShouldLoad(false);
          setOpacity(1);
          return;
        }

        if (entry.isIntersecting) {
          setShouldLoad(true);
        }

        const ratio = entry.intersectionRatio;
        setOpacity(0.28 + ratio * 0.72);

        const video = videoRef.current;
        if (!video) return;

        if (entry.isIntersecting && ratio >= 0.2) {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {});
          }
        } else {
          video.pause();
        }
      },
      {
        threshold: [0, 0.15, 0.2, 0.35, 0.5, 0.75, 1],
        rootMargin: "200px 0px",
      }
    );

    observer.observe(section);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", syncMotion);
    };
  }, []);

  const showVideo = shouldLoad && !reduceMotion;

  return (
    <section
      ref={sectionRef}
      data-printer-layers-band
      aria-labelledby="printer-layers-heading"
      className="relative isolate overflow-hidden bg-black"
    >
      <div className="relative min-h-[18rem] h-[42vh] max-h-[28rem] sm:min-h-[20rem] sm:h-[48vh] sm:max-h-[32rem]">
        <img
          src={POSTER_SRC}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />

        {showVideo && (
          <video
            ref={videoRef}
            data-printer-layers-video
            className="absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300 ease-out"
            style={{ opacity }}
            poster={POSTER_SRC}
            muted
            defaultMuted
            autoPlay
            loop
            playsInline
            preload="metadata"
            disablePictureInPicture
            disableRemotePlayback
            aria-hidden="true"
            tabIndex={-1}
          >
            <source src={WEBM_SRC} type="video/webm" />
            <source src={MP4_SRC} type="video/mp4" />
          </video>
        )}

        <div
          className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/20"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/35"
          aria-hidden="true"
        />

        <div className="relative z-10 flex h-full items-end">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 pb-8 sm:pb-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
              FDM
            </p>
            <h2
              id="printer-layers-heading"
              className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-white"
            >
              Druk warstwami
            </h2>
            <p className="mt-2 max-w-md text-sm sm:text-[15px] leading-relaxed text-white/75">
              Warstwa po warstwie — od ścieżki filamentu do gotowego detalu.
            </p>
            <a
              href="#configurator"
              className="mt-4 inline-flex text-xs font-semibold uppercase tracking-[0.14em] text-white/80 hover:text-white"
            >
              Przejdź do wyceny
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
