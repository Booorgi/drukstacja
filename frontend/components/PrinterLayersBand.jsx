import React, { useEffect, useRef, useState } from "react";

const POSTER_SRC = "/videos/printer-layers-poster.jpg";
const WEBM_SRC = "/videos/printer-layers-loop.webm";
const MP4_SRC = "/videos/printer-layers-loop.mp4";
const LOGO_SRC = "/logo-drukstacja.png?v=2";
const VIDEO_ATMOSPHERE_OPACITY = 0.38;
const LOOP_PLAYBACK_RATE = 0.55;
const SEEK_EPSILON = 0.03;

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function prefersAutoplayFallback() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 768px)").matches;
  return coarse && narrow;
}

/** 0 at the top of the hero, 1 after the user has scrolled through it. */
export function heroScrollProgress(section, scrollY = 0) {
  if (!section) return 0;
  const top = typeof section.offsetTop === "number" ? section.offsetTop : 0;
  const height = typeof section.offsetHeight === "number" ? section.offsetHeight : 0;
  const start = Math.max(0, top);
  const range = Math.max(1, height * 0.9);
  return Math.min(1, Math.max(0, (scrollY - start) / range));
}

/**
 * Homepage hero: atmospheric printer loop behind the mark + short site copy.
 * Desktop scrubs currentTime from scroll progress through the hero.
 * Coarse/narrow viewports fall back to a slow muted loop while in view.
 * prefers-reduced-motion: poster only, no video.
 */
export default function PrinterLayersBand() {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const seekingRef = useRef(false);
  const pendingTimeRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [mode, setMode] = useState("scrub");

  useEffect(() => {
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarseMq = window.matchMedia("(pointer: coarse)");
    const narrowMq = window.matchMedia("(max-width: 768px)");

    const syncPrefs = () => {
      const reduced = motionMq.matches;
      setReduceMotion(reduced);
      if (reduced) {
        setShouldLoad(false);
        setMode("poster");
        const video = videoRef.current;
        if (video) video.pause();
        return;
      }
      setMode(prefersAutoplayFallback() ? "loop" : "scrub");
    };

    syncPrefs();
    motionMq.addEventListener("change", syncPrefs);
    coarseMq.addEventListener("change", syncPrefs);
    narrowMq.addEventListener("change", syncPrefs);

    const section = sectionRef.current;
    if (!section) {
      return () => {
        motionMq.removeEventListener("change", syncPrefs);
        coarseMq.removeEventListener("change", syncPrefs);
        narrowMq.removeEventListener("change", syncPrefs);
      };
    }

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
        if (!video) return;
        if (prefersAutoplayFallback()) {
          if (entry.isIntersecting) {
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === "function") {
              playPromise.catch(() => {});
            }
          } else {
            video.pause();
          }
        } else if (!entry.isIntersecting) {
          video.pause();
        }
      },
      {
        threshold: [0, 0.15, 0.35, 0.6, 1],
        rootMargin: "120px 0px",
      }
    );

    observer.observe(section);
    return () => {
      observer.disconnect();
      motionMq.removeEventListener("change", syncPrefs);
      coarseMq.removeEventListener("change", syncPrefs);
      narrowMq.removeEventListener("change", syncPrefs);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!shouldLoad || reduceMotion || !video) return undefined;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    let cancelled = false;
    let raf = 0;

    const applyScrubTime = (time) => {
      if (!video.duration || Number.isNaN(video.duration)) return;
      const next = Math.min(Math.max(time, 0), Math.max(video.duration - 0.04, 0));
      if (Math.abs(video.currentTime - next) < SEEK_EPSILON) return;
      if (seekingRef.current) {
        pendingTimeRef.current = next;
        return;
      }
      seekingRef.current = true;
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        seekingRef.current = false;
        if (pendingTimeRef.current != null) {
          const queued = pendingTimeRef.current;
          pendingTimeRef.current = null;
          applyScrubTime(queued);
        }
      };
      video.addEventListener("seeked", onSeeked);
      try {
        video.currentTime = next;
      } catch {
        seekingRef.current = false;
      }
    };

    const scrubFromScroll = () => {
      if (cancelled || prefersReducedMotion() || prefersAutoplayFallback()) return;
      const section = sectionRef.current;
      if (!section || !video.duration) return;
      const progress = heroScrollProgress(section, window.scrollY || window.pageYOffset || 0);
      applyScrubTime(progress * video.duration);
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        scrubFromScroll();
      });
    };

    const start = async () => {
      try {
        const playPromise = video.play();
        if (playPromise) await playPromise;
      } catch {
        if (mode === "scrub") {
          setMode("loop");
        }
        return;
      }
      if (cancelled) return;

      if (prefersAutoplayFallback()) {
        video.loop = true;
        video.playbackRate = LOOP_PLAYBACK_RATE;
        return;
      }

      video.pause();
      video.loop = false;
      video.playbackRate = 1;
      scrubFromScroll();
    };

    const onMeta = () => {
      if (!cancelled) start();
    };

    if (video.readyState >= 1) {
      start();
    } else {
      video.addEventListener("loadedmetadata", onMeta);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onMeta);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [shouldLoad, reduceMotion, mode]);

  const showVideo = shouldLoad && !reduceMotion;

  return (
    <section
      ref={sectionRef}
      data-printer-layers-band
      data-printer-layers-hero
      data-printer-mode={reduceMotion ? "poster" : mode}
      aria-labelledby="printer-layers-heading"
      className="relative isolate overflow-hidden bg-[#111111]"
    >
      <div className="relative min-h-[68vh] sm:min-h-[72vh]">
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
            muted
            defaultMuted
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

        <div className="relative z-10 flex min-h-[68vh] sm:min-h-[72vh] items-center">
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
