import { useEffect, useState } from "react";

import { loadMapplsSdk } from "./mappls-web";
import { config } from "@/lib/config";

export type MapplsScriptStatus = "loading" | "ready" | "error";

/**
 * Loads the Mappls Web Maps SDK exactly once and reports readiness. Web only —
 * native uses the Mappls GL React Native SDK instead (see MapView.native.tsx).
 */
export function useMapplsScript(): { status: MapplsScriptStatus; error: string | null } {
  const [status, setStatus] = useState<MapplsScriptStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadMapplsSdk(config.mapplsMapSdkKey)
      .then(() => {
        if (!cancelled) {
          setStatus("ready");
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unknown Mappls SDK error");
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { status, error };
}
