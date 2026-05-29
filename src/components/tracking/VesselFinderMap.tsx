import React, { useState, useEffect } from "react";
import { Ship, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface VesselFinderMapProps {
  vesselName?: string | null;
  imo?: string | null;
  mmsi?: string | null;
  height?: number;
  showTrack?: boolean;
}

// Session-level cache to avoid duplicate invokes for the same vessel name
const resolvedImoCache = new Map<string, { imo?: string; mmsi?: string }>();

const VesselFinderMap: React.FC<VesselFinderMapProps> = ({
  vesselName,
  imo,
  mmsi,
  height = 350,
  showTrack = true,
}) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [resolvedImo, setResolvedImo] = useState<string | null>(null);
  const [resolvedMmsi, setResolvedMmsi] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Auto-resolve IMO from vesselName when none provided
  useEffect(() => {
    if (imo || mmsi || !vesselName) return;
    const key = vesselName.trim().toUpperCase();
    if (!key || key.length < 2) return;

    const cached = resolvedImoCache.get(key);
    if (cached) {
      setResolvedImo(cached.imo || null);
      setResolvedMmsi(cached.mmsi || null);
      return;
    }

    let cancelled = false;
    setResolving(true);
    supabase.functions.invoke('resolve-vessel-imo', { body: { vesselName } })
      .then(({ data }) => {
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
  }, [vesselName, imo, mmsi]);

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

  // If no IMO/MMSI, show informative message (no manual action)
  if (!embedUrl) {
    return (
      <div 
        className="rounded-xl border border-[rgba(255,255,255,.1)] bg-[rgba(0,0,0,.4)] flex flex-col items-center justify-center gap-4 p-6"
        style={{ height }}
      >
        <div className="flex items-center gap-3 text-[#aaaaaa]">
          <Ship className="w-8 h-8 text-[#ffc800]/50" />
          <div className="text-center">
            <p className="text-sm font-medium text-[#f5f5f5]">
              {vesselName || "Navio não identificado"}
            </p>
            <p className="text-xs text-[#666] mt-1">
              IMO não disponível para rastreio em tempo real
            </p>
          </div>
        </div>

        {vesselName && (
          <a
            href={`https://www.vesselfinder.com/?imo=0&name=${encodeURIComponent(vesselName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/20 text-blue-400 text-sm hover:bg-blue-600/30 transition"
          >
            <ExternalLink className="w-4 h-4" />
            Buscar "{vesselName}" no VesselFinder
          </a>
        )}
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
          {vesselName && (
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
        title={`Rastreio do navio ${vesselName || effectiveImo || effectiveMmsi}`}
        allow="fullscreen"
      />

      {/* Vessel info overlay */}
      <div className="absolute bottom-2 left-2 bg-[rgba(0,0,0,.7)] backdrop-blur-sm rounded-lg px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Ship className="w-4 h-4 text-[#ffc800]" />
          <div>
            {vesselName && <span className="text-[#f5f5f5] font-medium">{vesselName}</span>}
            {effectiveImo && <span className="text-[#aaaaaa] ml-2">IMO: {effectiveImo}</span>}
          </div>
        </div>
      </div>

      {/* External link */}
      <a
        href={`https://www.vesselfinder.com/?imo=${imo || '0'}`}
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
