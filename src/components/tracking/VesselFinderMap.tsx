import React, { useState, useEffect, useRef } from "react";
import { Ship, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface VesselFinderMapProps {
  shipperName?: string | null;
  imo?: string | null;
  mmsi?: string | null;
  height?: number;
  showTrack?: boolean;
  latitude?: string | number | null;
  longitude?: string | number | null;
  lastEvent?: string | null;
  lastEventLocation?: string | null;
  eta?: string | null;
  destino?: string | null;
}

// Session-level cache to avoid duplicate invokes for the same shipper/vessel name
const resolvedImoCache = new Map<string, { imo?: string; mmsi?: string }>();

// Cache token across instances
let cachedMapboxToken: string | null = null;
let mapboxTokenPromise: Promise<string | null> | null = null;
async function getMapboxToken(): Promise<string | null> {
  if (cachedMapboxToken) return cachedMapboxToken;
  if (mapboxTokenPromise) return mapboxTokenPromise;
  mapboxTokenPromise = (async () => {
    try {
      const res = await fetch('/api/admin/mapbox-token');
      const json = await res.json();
      const token = json?.token || json?.mapboxToken || null;
      if (token) cachedMapboxToken = token;
      return token;
    } catch (e) {
      console.error("Failed to fetch Mapbox token:", e);
      return null;
    }
  })();
  return mapboxTokenPromise;
}

function parseCoord(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function formatEta(eta?: string | null): string {
  if (!eta) return "—";
  try {
    const d = new Date(eta);
    if (Number.isNaN(d.getTime())) return eta;
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return eta;
  }
}

// ---- Inner Mapbox subview for the "no IMO but have coords" case ----
const LastEventMap: React.FC<{
  shipperName?: string | null;
  lat: number;
  lon: number;
  lastEvent?: string | null;
  lastEventLocation?: string | null;
  eta?: string | null;
  destino?: string | null;
  height: number;
}> = ({ shipperName, lat, lon, lastEvent, lastEventLocation, eta, destino, height }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [token, setToken] = useState<string | null>(cachedMapboxToken);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      getMapboxToken().then((t) => {
        if (cancelled) return;
        if (!t) setError("Token Mapbox indisponível");
        else setToken(t);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !containerRef.current) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [lon, lat],
      zoom: 4,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    // Custom ship marker
    const el = document.createElement("div");
    el.style.cssText = `
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(245,184,67,0.15);
      border: 2px solid #F5B843;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 18px rgba(245,184,67,0.6);
    `;
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5B843" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4"/><path d="M12 2v3"/></svg>`;

    const popupHtml = `
      <div style="font-family: inherit; color:#0f172a; min-width: 200px;">
        <div style="font-weight:600; font-size:13px; margin-bottom:6px; color:#0f172a;">
          ${shipperName ? String(shipperName).replace(/</g, "&lt;") : "Navio"}
        </div>
        <table style="font-size:12px; line-height:1.5; border-collapse:collapse;">
          <tr><td style="padding-right:8px; color:#64748b;">Último evento</td><td><b>${lastEvent ? String(lastEvent).replace(/</g, "&lt;") : "—"}</b></td></tr>
          ${lastEventLocation ? `<tr><td style="padding-right:8px; color:#64748b;">Local</td><td><b>${String(lastEventLocation).replace(/</g, "&lt;")}</b></td></tr>` : ""}
          <tr><td style="padding-right:8px; color:#64748b;">ETA</td><td><b>${formatEta(eta)}</b></td></tr>
          ${destino ? `<tr><td style="padding-right:8px; color:#64748b;">Destino</td><td><b>${String(destino).replace(/</g, "&lt;")}</b></td></tr>` : ""}
          <tr><td style="padding-right:8px; color:#64748b;">Posição</td><td><b>${lat.toFixed(3)}, ${lon.toFixed(3)}</b></td></tr>
        </table>
      </div>
    `;

    const popup = new mapboxgl.Popup({ offset: 22, closeButton: true, closeOnClick: false, maxWidth: "280px" }).setHTML(popupHtml);

    new mapboxgl.Marker({ element: el })
      .setLngLat([lon, lat])
      .setPopup(popup)
      .addTo(map)
      .togglePopup();

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token, lat, lon, shipperName, lastEvent, lastEventLocation, eta, destino]);

  if (error) {
    return (
      <div
        className="rounded-xl border border-[rgba(255,255,255,.1)] bg-[rgba(0,0,0,.4)] flex items-center justify-center gap-2 text-[#aaaaaa] text-sm"
        style={{ height }}
      >
        <AlertCircle className="w-4 h-4" /> {error}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,.1)] overflow-hidden relative" style={{ height }}>
      {!token && (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,.6)] z-10">
          <div className="flex items-center gap-3 text-[#aaaaaa]">
            <Loader2 className="w-6 h-6 animate-spin text-[#ffc800]" />
            <span className="text-sm">Carregando mapa…</span>
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Vessel info overlay */}
      <div className="absolute bottom-2 left-2 bg-[rgba(0,0,0,.7)] backdrop-blur-sm rounded-lg px-3 py-2 text-xs pointer-events-none">
        <div className="flex items-center gap-2">
          <Ship className="w-4 h-4 text-[#ffc800]" />
          <span className="text-[#f5f5f5] font-medium">{shipperName || "Navio"}</span>
          <span className="text-[#aaaaaa] ml-2">posição do último evento</span>
        </div>
      </div>
    </div>
  );
};

const VesselFinderMap: React.FC<VesselFinderMapProps> = ({
  shipperName,
  imo,
  mmsi,
  height = 350,
  showTrack = true,
  latitude,
  longitude,
  lastEvent,
  lastEventLocation,
  eta,
  destino,
}) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [resolvedImo, setResolvedImo] = useState<string | null>(null);
  const [resolvedMmsi, setResolvedMmsi] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Auto-resolve IMO from shipperName when none provided
  useEffect(() => {
    if (imo || mmsi || !shipperName) return;
    const key = shipperName.trim().toUpperCase();
    if (!key || key.length < 2) return;

    const cached = resolvedImoCache.get(key);
    if (cached) {
      setResolvedImo(cached.imo || null);
      setResolvedMmsi(cached.mmsi || null);
      return;
    }

    let cancelled = false;
    setResolving(true);
    fetch('/api/sea/resolve-vessel-imo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipperName }),
    })
      .then(res => res.json())
      .then((data) => {
        if (cancelled) return;
        const found = { imo: data?.imo, mmsi: data?.mmsi };
        resolvedImoCache.set(key, found);
        setResolvedImo(found.imo || null);
        setResolvedMmsi(found.mmsi || null);
      })
      .catch((err) => {
        console.error('resolve-vessel-imo failed:', err);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => { cancelled = true; };
  }, [shipperName, imo, mmsi]);

  const effectiveImo = imo || resolvedImo;
  const effectiveMmsi = mmsi || resolvedMmsi;

  // Build embed URL based on available identifiers
  const getEmbedUrl = (): string | null => {
    if (effectiveImo) {
      return `https://www.vesselfinder.com/aismap?imo=${effectiveImo}&zoom=6&width=100%25&height=${height}&names=true&track=${showTrack}`;
    }
    if (effectiveMmsi) {
      return `https://www.vesselfinder.com/aismap?mmsi=${effectiveMmsi}&zoom=6&width=100%25&height=${height}&names=true&track=${showTrack}`;
    }
    return null;
  };

  const embedUrl = getEmbedUrl();

  // Resolving state — show spinner instead of "not found" while we look up
  if (!embedUrl && resolving) {
    return (
      <div
        className="rounded-xl border border-[rgba(255,255,255,.1)] bg-[rgba(0,0,0,.4)] flex items-center justify-center gap-3"
        style={{ height }}
      >
        <Loader2 className="w-5 h-5 animate-spin text-[#ffc800]" />
        <span className="text-sm text-[#aaaaaa]">Localizando navio…</span>
      </div>
    );
  }

  // No IMO/MMSI: try Mapbox fallback using last event coordinates
  if (!embedUrl) {
    const lat = parseCoord(latitude);
    const lon = parseCoord(longitude);
    const hasCoords =
      lat !== null && lon !== null &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 &&
      !(lat === 0 && lon === 0);

    if (hasCoords) {
      return (
        <LastEventMap
          shipperName={shipperName}
          lat={lat as number}
          lon={lon as number}
          lastEvent={lastEvent}
          lastEventLocation={lastEventLocation}
          eta={eta}
          destino={destino}
          height={height}
        />
      );
    }

    // Discreet fallback — no alarming "not identified" banner
    return (
      <div
        className="rounded-xl border border-[rgba(255,255,255,.1)] bg-[rgba(0,0,0,.4)] flex items-center justify-center gap-3 px-4"
        style={{ height }}
      >
        <Ship className="w-5 h-5 text-[#ffc800]/60" />
        <span className="text-sm text-[#aaaaaa]">
          {shipperName ? `Posição em tempo real indisponível para ${shipperName}` : "Posição em tempo real indisponível"}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,.1)] overflow-hidden relative" style={{ height }}>
      {/* Loading state */}
      {!iframeLoaded && !iframeError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,.6)] z-10">
          <div className="flex items-center gap-3 text-[#aaaaaa]">
            <Loader2 className="w-6 h-6 animate-spin text-[#ffc800]" />
            <span className="text-sm">Carregando mapa do navio...</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {iframeError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(0,0,0,.6)] z-10 gap-3">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm text-[#aaaaaa]">Erro ao carregar mapa</p>
          {shipperName && (
            <a
              href={`https://www.vesselfinder.com/?imo=${effectiveImo || '0'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/20 text-blue-400 text-sm hover:bg-blue-600/30 transition"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir no VesselFinder
            </a>
          )}
        </div>
      )}

      {/* VesselFinder iframe */}
      <iframe
        src={embedUrl}
        width="100%"
        height={height}
        style={{ border: 'none' }}
        onLoad={() => setIframeLoaded(true)}
        onError={() => setIframeError(true)}
        title={`Rastreio do navio ${shipperName || effectiveImo || effectiveMmsi}`}
        allow="fullscreen"
      />

      {/* Vessel info overlay */}
      <div className="absolute bottom-2 left-2 bg-[rgba(0,0,0,.7)] backdrop-blur-sm rounded-lg px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Ship className="w-4 h-4 text-[#ffc800]" />
          <div>
            {shipperName && <span className="text-[#f5f5f5] font-medium">{shipperName}</span>}
            {effectiveImo && <span className="text-[#aaaaaa] ml-2">IMO: {effectiveImo}</span>}
          </div>
        </div>
      </div>

      {/* External link */}
      <a
        href={`https://www.vesselfinder.com/?imo=${effectiveImo || '0'}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-2 right-2 bg-[rgba(0,0,0,.7)] backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1"
      >
        <ExternalLink className="w-3 h-3" />
        Abrir
      </a>
    </div>
  );
};

export default VesselFinderMap;
