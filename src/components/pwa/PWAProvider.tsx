"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAProvider() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  // Register service worker
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }
  }, []);

  // Capture install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);

      // Show install banner after 30 seconds if not dismissed before
      const dismissed = localStorage.getItem("wl_install_dismissed");
      if (!dismissed) {
        setTimeout(() => setShowInstallBanner(true), 30000);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Show notification prompt after 2 minutes on first visit
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;

    const dismissed = localStorage.getItem("wl_notif_dismissed");
    if (dismissed) return;

    const timer = setTimeout(() => setShowNotifBanner(true), 120000);
    return () => clearTimeout(timer);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setInstallPrompt(null);
    setShowInstallBanner(false);
  }, [installPrompt]);

  const handleDismissInstall = useCallback(() => {
    setShowInstallBanner(false);
    localStorage.setItem("wl_install_dismissed", Date.now().toString());
  }, []);

  const handleEnableNotifications = useCallback(async () => {
    if (!("Notification" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      // Subscribe to push notifications
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // For now, just enable local notifications
        // Push subscription requires a VAPID key + backend endpoint
        // We'll use the notification API directly for breaking events
        localStorage.setItem("wl_notif_enabled", "true");
      }
    }
    setShowNotifBanner(false);
  }, []);

  const handleDismissNotif = useCallback(() => {
    setShowNotifBanner(false);
    localStorage.setItem("wl_notif_dismissed", Date.now().toString());
  }, []);

  if (isInstalled && !showNotifBanner) return null;

  return (
    <>
      {/* Install banner */}
      {showInstallBanner && !isInstalled && (
        <div className="fixed bottom-16 left-3 right-3 z-50 animate-in slide-in-from-bottom md:bottom-4 md:left-auto md:right-4 md:w-80">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300">
                  <path d="M12 5v14M19 12l-7 7-7-7" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-200">
                  Install War Library
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Get instant access from your home screen. Works offline.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleInstall}
                    className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-white"
                  >
                    Install
                  </button>
                  <button
                    onClick={handleDismissInstall}
                    className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    Not now
                  </button>
                </div>
              </div>
              <button
                onClick={handleDismissInstall}
                className="text-zinc-600 hover:text-zinc-400"
                aria-label="Dismiss"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification permission banner */}
      {showNotifBanner && (
        <div className="fixed bottom-16 left-3 right-3 z-50 animate-in slide-in-from-bottom md:bottom-4 md:left-auto md:right-4 md:w-80">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-900/30">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-200">
                  Breaking event alerts
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Get notified when major developments happen. No spam — only critical updates.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleEnableNotifications}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500"
                  >
                    Enable alerts
                  </button>
                  <button
                    onClick={handleDismissNotif}
                    className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    Not now
                  </button>
                </div>
              </div>
              <button
                onClick={handleDismissNotif}
                className="text-zinc-600 hover:text-zinc-400"
                aria-label="Dismiss"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
