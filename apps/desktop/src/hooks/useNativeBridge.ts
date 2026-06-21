import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Screen, WindowMode } from "../lib/types";

interface UseNativeBridgeOptions {
  paused: boolean;
  windowMode: WindowMode;
  onNavigate: (screen: Screen) => void;
  onTogglePause: () => void;
  onSetWindowMode: (mode: WindowMode) => void;
  isDemoMode: boolean;
  setPaused: (p: boolean) => void;
  setWindowMode: (m: WindowMode) => void;
}

export function useNativeBridge(options: UseNativeBridgeOptions) {
  const {
    paused,
    windowMode,
    onNavigate,
    onTogglePause,
    onSetWindowMode,
    isDemoMode,
    setPaused,
    setWindowMode,
  } = options;

  useEffect(() => {
    function navigateFromNative(event: Event) {
      const screen = (event as CustomEvent<Screen>).detail;
      if (screen in ({} as any)) { // screenLabels check can be passed or loose
        onNavigate(screen);
        onSetWindowMode("large");
      }
    }

    function togglePauseFromNative() {
      onTogglePause();
    }

    function openQuickViewFromNative() {
      onSetWindowMode("compact");
    }

    function openLargeViewFromNative() {
      onSetWindowMode("large");
    }

    window.addEventListener("clear-capacity:navigate", navigateFromNative);
    window.addEventListener("clear-capacity:toggle-pause", togglePauseFromNative);
    window.addEventListener("clear-capacity:quick-view", openQuickViewFromNative);
    window.addEventListener("clear-capacity:large-view", openLargeViewFromNative);

    return () => {
      window.removeEventListener("clear-capacity:navigate", navigateFromNative);
      window.removeEventListener("clear-capacity:toggle-pause", togglePauseFromNative);
      window.removeEventListener("clear-capacity:quick-view", openQuickViewFromNative);
      window.removeEventListener("clear-capacity:large-view", openLargeViewFromNative);
    };
  }, [onNavigate, onTogglePause, onSetWindowMode]);

  useEffect(() => {
    if (isDemoMode) return;
    void invoke("set_pause_menu_label", { paused }).catch(() => undefined);
    void invoke("set_activity_capture_paused", { paused }).catch(() => undefined);
  }, [isDemoMode, paused]);

  useEffect(() => {
    if (windowMode === "compact") {
      setWindowMode("compact"); // ensure
    } else {
      setWindowMode("large");
    }
    void invoke("set_clear_capacity_window_mode", { mode: windowMode }).catch(() => undefined);
  }, [windowMode, setWindowMode]);
}
