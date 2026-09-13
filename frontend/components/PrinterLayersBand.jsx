import React, { useEffect, useRef, useState } from "react";
import scrubMath from "./printerLayersBandScrub";

const { SEEK_EPSILON, clampScrubTime, heroScrollProgress, nextScrubTime } = scrubMath;

const POSTER_SRC = "/videos/printer-layers-poster.jpg";
const WEBM_SRC = "/videos/printer-layers-loop.webm";
const MP4_SRC = "/videos/printer-layers-loop.mp4";
const LOGO_SRC = "/logo-drukstacja.png?v=2";
const VIDEO_ATMOSPHERE_OPACITY = 0.38;
const LOOP_PLAYBACK_RATE = 0.85;
const SEEK_WATCHDOG_MS = 90;
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

function prefersAutoplayFallback() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 768px)").matches;
  return coarse && narrow;
}

/**
 * Homepage hero: atmospheric printer loop behind the mark + short site copy.
 * Desktop scrubs currentTime from scroll progress through the hero.
 * Coarse/narrow viewports fall back to a slow muted loop while in view.
 * prefers-reduced-motion: poster only, no video.
 *
 * Scrub smoothness depends on a short GOP. Seeking mid-GOP hitchs because the
 * decoder must walk from the last I-frame. Re-encode with
 * `frontend/scripts/encode-printer-hero.sh` (x264 `-g 3 -bf 0`, ~0.6×, 30 fps).
 */
export default function PrinterLayersBand() {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const seekingRef = useRef(false);
  const targetTimeRef = useRef(0);
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

    const setHeroActive = (active) => {
      document.documentElement.toggleAttribute("data-printer-hero-active", Boolean(active));
    };

    const syncHeroActive = () => setHeroActive(isHeroOnScreen(section));

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (prefersReducedMotion()) {
          setShouldLoad(false);
        } else if (entry.isIntersecting) {
          setShouldLoad(true);
        }
        const video = videoRef.current;
        if (!video || prefersReducedMotion()) return;
        if (prefersAutoplayFallback()) {
          if (entry.isIntersecting) {
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === "function") {
              playPromise.catch(() => {});
            }
          } else {
            video.pause();
          }
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
    video.preload = "auto";

    let cancelled = false;
    let raf = 0;
    let watchdog = 0;
    let seekGen = 0;

    const readTargetFromScroll = () => {
      const section = sectionRef.current;
      if (!section || !video.duration || Number.isNaN(video.duration)) return;
      const progress = heroScrollProgress(section, window.scrollY || window.pageYOffset || 0);
      targetTimeRef.current = clampScrubTime(progress * video.duration, video.duration);
    };

    const clearWatchdog = () => {
      if (watchdog) {
        window.clearTimeout(watchdog);
        watchdog = 0;
      }
    };

    const finishSeek = (id) => {
      if (id !== seekGen) return;
      video.removeEventListener("seeked", onSeeked);
      clearWatchdog();
      seekingRef.current = false;
    };

    const onSeeked = () => {
      finishSeek(seekGen);
    };

    const seekTo = (time) => {
      const next = clampScrubTime(time, video.duration);
      if (Math.abs(video.currentTime - next) < SEEK_EPSILON) return;
      const id = ++seekGen;
      seekingRef.current = true;
      video.addEventListener("seeked", onSeeked);
      clearWatchdog();
      watchdog = window.setTimeout(() => finishSeek(id), SEEK_WATCHDOG_MS);
      try {
        video.currentTime = next;
      } catch {
        finishSeek(id);
      }
    };

    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      if (cancelled || prefersReducedMotion() || prefersAutoplayFallback()) return;
      if (!video.duration || Number.isNaN(video.duration)) return;

      readTargetFromScroll();
      if (seekingRef.current) return;
      if (!isHeroOnScreen(sectionRef.current)) return;

      const target = targetTimeRef.current;
      const next = nextScrubTime(video.currentTime, target);
      seekTo(next);
    };

    const startLoop = () => {
      video.loop = true;
      video.playbackRate = LOOP_PLAYBACK_RATE;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          if (!cancelled && mode === "scrub") setMode("loop");
        });
      }
    };

    const startScrub = () => {
      // Stay paused — do not play()/pause() just to unlock seeking.
      video.pause();
      video.loop = false;
      video.playbackRate = 1;
      readTargetFromScroll();
      seekTo(targetTimeRef.current);
      if (!raf) raf = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (cancelled) return;
      if (prefersAutoplayFallback()) {
        startLoop();
        return;
      }
      startScrub();
    };

    if (video.readyState >= 1) {
      start();
    } else {
      video.addEventListener("loadedmetadata", start);
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", start);
      video.removeEventListener("seeked", onSeeked);
      clearWatchdog();
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
