import React, { useEffect, useRef, useState } from "react";

const POSTER_SRC = "/videos/printer-layers-poster.jpg";
const WEBM_SRC = "/videos/printer-layers-loop.webm";
const MP4_SRC = "/videos/printer-layers-loop.mp4";
const LOGO_SRC = "/logo-drukstacja.png?v=2";
const VIDEO_ATMOSPHERE_OPACITY = 0.38;
const NAV_CLEARANCE_PX = 80;

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isHeroOnScreen(section) {
  if (!section) return false;
  return section.getBoundingClientRect().bottom > NAV_CLEARANCE_PX;
}

/**
 * Homepage hero: atmospheric printer loop behind the mark + short site copy.
 * Desktop and mobile autoplay a muted loop. prefers-reduced-motion: poster only.
 */
export default function PrinterLayersBand() {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncPrefs = () => {
      const reduced = motionMq.matches;
      setReduceMotion(reduced);
      if (reduced) {
        setShouldLoad(false);
        const video = videoRef.current;
        if (video) video.pause();
      }
    };

    syncPrefs();
    motionMq.addEventListener("change", syncPrefs);

    const section = sectionRef.current;
    if (!section) {
      return () => motionMq.removeEventListener("change", syncPrefs);
    }

    const setHeroActive = (active) => {
      document.documentElement.toggleAttribute("data-printer-hero-active", Boolean(active));
    };

    const syncHeroActive = () => setHeroActive(isHeroOnScreen(section));

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (prefersReducedMotion()) {
          setShouldLoad(false);
          return;
        }
        if (entry.isIntersecting) {
          setShouldLoad(true);
        }
        const video = videoRef.current;
        if (!video || prefersReducedMotion()) return;
        if (entry.isIntersecting) {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {});
          }
        } else {
          video.pause();
        }
      },
      {
        threshold: [0, 0.15, 0.35, 0.6, 1],
        rootMargin: "120px 0px",
      }
    );

    observer.observe(section);
    syncHeroActive();
    window.addEventListener("scroll", syncHeroActive, { passive: true });
    window.addEventListener("resize", syncHeroActive);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", syncHeroActive);
      window.removeEventListener("resize", syncHeroActive);
      setHeroActive(false);
      motionMq.removeEventListener("change", syncPrefs);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!shouldLoad || reduceMotion || !video) return undefined;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = "auto";

    const play = () => {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    };

    if (video.readyState >= 2) {
      play();
    } else {
      video.addEventListener("canplay", play);
    }

    return () => {
      video.removeEventListener("canplay", play);
    };
  }, [shouldLoad, reduceMotion]);

  const showVideo = shouldLoad && !reduceMotion;

  return (
    <section
      ref={sectionRef}
      data-printer-layers-band
      data-printer-layers-hero
      data-printer-mode={reduceMotion ? "poster" : "loop"}
      aria-labelledby="printer-layers-heading"
      className="relative isolate overflow-hidden bg-[#111111]"
    >
      <div className="relative min-h-[calc(100dvh-4rem)] sm:min-h-[calc(100dvh-4.5rem)]">
        <img
          src={POSTER_SRC}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={{ opacity: 0.22 }}
        />

        {showVideo && (
          <video
            ref={videoRef}
            data-printer-layers-video
            className="absolute inset-0 h-full w-full object-cover object-center pointer-events-none"
            style={{ opacity: VIDEO_ATMOSPHERE_OPACITY }}
            poster={POSTER_SRC}
            autoPlay
            muted
            defaultMuted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
            aria-hidden="true"
            tabIndex={-1}
          >
            <source src={WEBM_SRC} type="video/webm" />
            <source src={MP4_SRC} type="video/mp4" />
          </video>
        )}

        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
        <div
          className="absolute inset-0 bg-gradient-to-b from-[#111111]/55 via-transparent to-[#E2E2E2]"
          aria-hidden="true"
        />

        <div className="relative z-10 flex min-h-[calc(100dvh-4rem)] sm:min-h-[calc(100dvh-4.5rem)] items-center">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-14 sm:py-16">
            <img
              src={LOGO_SRC}
              alt="drukstacja"
              className="h-9 sm:h-12 w-auto"
            />
            <h2
              id="printer-layers-heading"
              className="mt-5 text-2xl sm:text-3xl font-semibold tracking-tight text-white"
            >
              Wycena druku 3D w studio
            </h2>
            <p className="mt-2 max-w-lg text-sm sm:text-[15px] leading-relaxed text-white/80">
              Wgraj model, dobierz filament i warstwę — dostaniesz cenę od razu.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
