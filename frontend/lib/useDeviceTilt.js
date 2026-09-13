import { useCallback, useEffect, useRef, useState } from "react";
import {
  dampenTilt,
  isSecureOrientationContext,
  mapOrientationToTilt,
  needsOrientationPermission,
  supportsDeviceOrientation,
} from "./deviceTilt";

const IDLE_TILT = { x: 0, z: 0, active: false };

/**
 * iOS Safari 13+ requires DeviceOrientationEvent.requestPermission() after a
 * user gesture. Desktop / denied / unsupported stay a no-op; drag still works.
 */
export default function useDeviceTilt() {
  const tiltRef = useRef({ ...IDLE_TILT });
  const statusRef = useRef("idle");
  const pendingRef = useRef(false);
  const subscribedRef = useRef(false);
  const [status, setStatus] = useState("idle");
  const [needsPrompt, setNeedsPrompt] = useState(false);
  const [hasMotion, setHasMotion] = useState(false);
  const hasMotionRef = useRef(false);

  const setTiltStatus = useCallback((next) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const applyOrientation = useCallback((event) => {
    if (event.beta == null && event.gamma == null) return;
    const mapped = mapOrientationToTilt(event.beta, event.gamma);
    const smoothed = dampenTilt(tiltRef.current, mapped);
    tiltRef.current = { x: smoothed.x, z: smoothed.z, active: true };
    if (!hasMotionRef.current) {
      hasMotionRef.current = true;
      setHasMotion(true);
    }
    if (typeof window !== "undefined") {
      window.__KEYCHAIN_TILT = tiltRef.current;
    }
  }, []);

  const subscribe = useCallback(() => {
    if (typeof window === "undefined" || subscribedRef.current) return;
    subscribedRef.current = true;
    window.addEventListener("deviceorientation", applyOrientation, true);
    window.__KEYCHAIN_TILT = tiltRef.current;
  }, [applyOrientation]);

  const enableTilt = useCallback(async () => {
    if (typeof window === "undefined") return statusRef.current;
    const current = statusRef.current;
    if (current === "granted" || current === "denied" || current === "unsupported") {
      return current;
    }
    if (pendingRef.current) return current;

    if (!isSecureOrientationContext(window) || !supportsDeviceOrientation(window)) {
      setTiltStatus("unsupported");
      return "unsupported";
    }

    try {
      if (needsOrientationPermission(window)) {
        pendingRef.current = true;
        setTiltStatus("pending");
        const res = await window.DeviceOrientationEvent.requestPermission();
        pendingRef.current = false;
        if (res !== "granted") {
          setTiltStatus("denied");
          return "denied";
        }
      }
      subscribe();
      setTiltStatus("granted");
      return "granted";
    } catch {
      pendingRef.current = false;
      // NotAllowedError if this was not a user gesture — keep idle so a real tap can retry.
      if (statusRef.current === "pending") setTiltStatus("idle");
      return statusRef.current;
    }
  }, [setTiltStatus, subscribe]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (!isSecureOrientationContext(window) || !supportsDeviceOrientation(window)) {
      setTiltStatus("unsupported");
      setNeedsPrompt(false);
      return undefined;
    }

    if (needsOrientationPermission(window)) {
      setNeedsPrompt(true);
      return undefined;
    }

    subscribe();
    setTiltStatus("granted");
    setNeedsPrompt(false);
    return undefined;
  }, [setTiltStatus, subscribe]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      window.removeEventListener("deviceorientation", applyOrientation, true);
      subscribedRef.current = false;
    };
  }, [applyOrientation]);

  return {
    tiltRef,
    status,
    needsPrompt,
    hasMotion,
    enableTilt,
  };
}
