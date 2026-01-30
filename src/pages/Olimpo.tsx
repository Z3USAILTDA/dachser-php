import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Maximize2, Minimize2, Globe, X, Plane, Ship, LogOut } from "lucide-react";
import { useUsageLog } from "@/hooks/useUsageLog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/layout/TablePagination";
import dachserBg from "@/assets/dachser-background.jpg";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Olimpo mantém seu próprio layout devido ao mapa fullscreen
// Mas usa os mesmos estilos de card e cores do PageLayout

// Types
interface DataItem {
  id: string | number;
  mode: "air" | "sea";
  tipo_label: string;
  cliente: string;
  rota: string;
  eta_iso: string | null;
  eta_api: string;
  ata_iso: string | null;
  delivered_until_ts: number | null;
  status: "Em trânsito" | "Atraso" | "Entregue";
  orig: [number, number] | null;
  dest: [number, number] | null;
  prog: number;
  pos: [number, number] | null;
  flight: string | null;
  asset: string | null;
}

interface GroupedItem {
  key: string;
  tipo_label: string;
  cliente: string;
  rota: string;
  eta_api: string;
  status: string;
  count: number;
  mode: string;
  asset: string | null;
}

interface SelectedAssetDetails {
  mode: "air" | "sea";
  asset: string | null;
  flight: string | null;
  tipo_label: string;
  cliente: string;
  rota: string;
  eta_api: string;
  status: string;
  processos: string[];
}

// Helpers
const fmtLocalBRDateTime = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const logicKey = (it: DataItem) =>
  `${it.tipo_label}|${it.cliente}|${it.rota}|${it.eta_api || ""}`;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function greatCircle(a: [number, number], b: [number, number], steps = 128): [number, number][] {
  const [lat1, lon1] = a.map(toRad);
  const [lat2, lon2] = b.map(toRad);
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
      )
    );
  if (d === 0) return [a, b];
  const res: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    res.push([toDeg(lat), toDeg(lon)]);
  }
  return res;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function bezierArc(a: [number, number], b: [number, number], seed = 0, samples = 80, routeIndex = 0): [number, number][] {
  const A = { lat: a[0], lng: a[1] };
  const B = { lat: b[0], lng: b[1] };
  const mx = (A.lat + B.lat) / 2;
  const my = (A.lng + B.lng) / 2;
  const dx = B.lng - A.lng;
  const dy = B.lat - A.lat;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = -dy / len;
  const uy = dx / len;

  // Base curve height depends on distance
  const distFactor = Math.min(1, len / 100);
  const base = Math.min(20, Math.max(4, distFactor * 15 + 5));
  
  // Add significant variation based on route index to spread out overlapping routes
  const indexOffset = (routeIndex % 7) * 2.5 - 7.5; // Range: -7.5 to +10
  const seedJitter = ((seed % 1000) / 1000 - 0.5) * 4;
  const mag = base + indexOffset + seedJitter;

  // Alternate direction based on both seed and index for more variety
  const signFromSeed = (seed & 1) ? 1 : -1;
  const signFromIndex = (routeIndex % 3 === 0) ? 1 : (routeIndex % 3 === 1) ? -1 : 1;
  const hemisphereSign = (A.lat + B.lat >= 0 ? 1 : -1);
  const sign = signFromSeed * signFromIndex * hemisphereSign;
  
  const C = { lat: mx + uy * mag * sign, lng: my + ux * mag * sign };

  const pts: [number, number][] = [];
  for (let t = 0; t <= 1; t += 1 / samples) {
    const lat = (1 - t) * (1 - t) * A.lat + 2 * (1 - t) * t * C.lat + t * t * B.lat;
    const lng = (1 - t) * (1 - t) * A.lng + 2 * (1 - t) * t * C.lng + t * t * B.lng;
    pts.push([lat, lng]);
  }
  return pts;
}

function maritimeWaypoints(orig: [number, number], dest: [number, number]): [number, number][] {
  const [, olng] = orig;
  const [, dlng] = dest;
  const between = (v: number, a: number, b: number) => v >= Math.min(a, b) && v <= Math.max(a, b);

  const SUEZ_N: [number, number] = [31.265, 32.32];
  const BAB_EL: [number, number] = [12.6, 43.3];
  const MALACCA: [number, number] = [1.265, 103.825];
  const PANAMA: [number, number] = [9.26, -79.9];

  const atl = (lng: number) => between(lng, -80, 20);
  const ind = (lng: number) => between(lng, 45, 120);
  const pac = (lng: number) => lng < -120 || lng > 150;

  if ((atl(olng) && ind(dlng)) || (atl(dlng) && ind(olng))) {
    return [SUEZ_N, BAB_EL];
  }
  if ((ind(olng) && pac(dlng)) || (ind(dlng) && pac(olng))) {
    return [SUEZ_N, BAB_EL, MALACCA];
  }
  if ((atl(olng) && pac(dlng)) || (atl(dlng) && pac(olng))) {
    return [PANAMA];
  }
  return [];
}

function pointAtFraction(line: [number, number][], t: number): [number, number] {
  if (line.length < 2) return line[0] || [0, 0];
  
  // Calculate total distance
  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const [lat1, lon1] = line[i - 1];
    const [lat2, lon2] = line[i];
    // Simple euclidean approximation for distance
    const d = Math.sqrt((lat2 - lat1) ** 2 + (lon2 - lon1) ** 2);
    segLen.push(d);
    total += d;
  }
  
  const target = t * total;
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const [lat1, lon1] = line[i - 1];
    const [lat2, lon2] = line[i];
    const d = segLen[i - 1];
    if (acc + d >= target) {
      const r = (target - acc) / d;
      return [lat1 + (lat2 - lat1) * r, lon1 + (lon2 - lon1) * r];
    }
    acc += d;
  }
  return line[line.length - 1];
}

export default function Olimpo() {
  useUsageLog({ endpoint: "/olimpo" });
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const activeSourcesRef = useRef<string[]>([]);

  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<DataItem[]>([]);
  const [selectedAssetDetails, setSelectedAssetDetails] = useState<SelectedAssetDetails | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [masterContainerCount, setMasterContainerCount] = useState<number>(0);
  const pageSize = 10;

  // Filters
  const [daysFilter, setDaysFilter] = useState<number | null>(7);
  const [modeFilter, setModeFilter] = useState<"air" | "sea" | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isOlimpoOnly = user?.olimpo_only === 1;

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  const handleBack = () => {
    if (isOlimpoOnly) {
      handleLogout();
    } else {
      navigate("/dashboard");
    }
  };

  // Filter data - mais permissivo para mostrar mais itens
  const filteredData = data.filter((item) => {
    const now = Date.now();

    // Precisa ter rota válida (origem → destino)
    const hasValidRoute = item.rota && item.rota.includes("→");
    if (!hasValidRoute) return false;

    // Filter delivered items that are too old (24h após entrega)
    if (item.status === "Entregue") {
      if (item.delivered_until_ts && now > item.delivered_until_ts) return false;
      if (item.ata_iso) {
        const limit = new Date(item.ata_iso).getTime() + 24 * 60 * 60 * 1000;
        if (now > limit) return false;
      }
    } else if (daysFilter && item.eta_iso) {
      // Filtro de dias apenas para itens com ETA
      const d = new Date(item.eta_iso);
      const start = new Date(now - daysFilter * 24 * 60 * 60 * 1000);
      const end = new Date(now + daysFilter * 24 * 60 * 60 * 1000);
      if (d < start || d > end) return false;
    }
    // Se não tem ETA, mostrar mesmo assim (melhor mostrar do que esconder)

    if (modeFilter && item.mode !== modeFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;

    if (searchTerm) {
      const hay = [item.tipo_label, item.cliente, item.rota, item.asset, item.flight, item.status]
        .map((v) => (v || "").toString().toLowerCase())
        .join(" ");
      if (!hay.includes(searchTerm.toLowerCase())) return false;
    }

    return true;
  });

  // Aggregate for table
  const aggregatedData: GroupedItem[] = (() => {
    const mapAgg = new Map<string, GroupedItem>();
    for (const it of filteredData) {
      const k = logicKey(it);
      if (!mapAgg.has(k)) {
        mapAgg.set(k, {
          key: k,
          tipo_label: it.tipo_label,
          cliente: it.cliente,
          rota: it.rota,
          eta_api: it.eta_api || "",
          status: it.status,
          count: 1,
          mode: it.mode,
          asset: it.asset,
        });
      } else {
        const o = mapAgg.get(k)!;
        o.count++;
        if (it.status === "Atraso") o.status = "Atraso";
        else if (it.status === "Em trânsito" && o.status !== "Atraso") o.status = "Em trânsito";
      }
    }
    return Array.from(mapAgg.values());
  })();

  // KPIs - usar masterContainerCount como fallback quando API SEA está pausada
  const seaTransitFromData = filteredData.filter((i) => i.mode === "sea" && i.status === "Em trânsito").length;
  const kpis = {
    seaTransit: seaTransitFromData > 0 ? seaTransitFromData : masterContainerCount,
    airActive: filteredData.filter((i) => i.mode === "air" && i.status !== "Entregue").length,
    delayed: filteredData.filter((i) => i.status === "Atraso").length,
    onTime: filteredData.length
      ? Math.round(((filteredData.length - filteredData.filter((i) => i.status === "Atraso").length) / filteredData.length) * 100)
      : 0,
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(aggregatedData.length / pageSize));
  const paginatedData = aggregatedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Load Mapbox token
  const loadMapboxToken = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-mapbox-token`);
      const json = await res.json();
      if (json?.token) {
        setMapboxToken(json.token);
      }
    } catch (err) {
      console.error("Error loading Mapbox token:", err);
    }
  }, []);

  // Load container count from master table (fallback when API is paused)
  const loadMasterContainerCount = useCallback(async () => {
    try {
      const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mariadb-proxy`;
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_sea_container_count' }),
      });
      const json = await res.json();
      if (json?.count !== undefined) {
        setMasterContainerCount(json.count);
      }
    } catch (err) {
      console.error('Error loading container count from master:', err);
    }
  }, []);

  // Load data from API
  const loadData = useCallback(async () => {
    setIsLoading(true);
    const newData: DataItem[] = [];

    try {
      // Base URL for edge function
      const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy`;
      
      // Seed AIR
      const seedAirRes = await fetch(`${baseUrl}?action=seed_air`);
      const seedAirJson = await seedAirRes.json();
      const seedAir = Array.isArray(seedAirJson?.data) ? seedAirJson.data : [];

      if (seedAir.length > 0) {
        const normFlight = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const isValidFlight = (f: string) => /^(?:[A-Z]{2,3}|[0-9][A-Z])[0-9]{1,4}[A-Z]?$/i.test(f);

        const flightsCsv = Array.from(
          new Set(seedAir.map((x: any) => normFlight(x.flight)).filter((f: string) => f && f !== "0" && isValidFlight(f)))
        ).join(",");

        if (flightsCsv) {
          // Get live positions - this endpoint returns: lat, lon, orig_iata, dest_iata, eta
          const fullRes = await fetch(`${baseUrl}?action=fr24_full&flights=${encodeURIComponent(flightsCsv)}&batch=12&retries=3`);
          const fullJson = await fullRes.json();
          const fullArr = Array.isArray(fullJson?.data) ? fullJson.data : [];

          // Build index from fr24_full response - this has all the data we need
          const idxFull = new Map<string, any>();
          for (const f of fullArr) {
            const flightNum = f.flight || f.number || f?.identification?.number?.default || f.callsign || "";
            const k = normFlight(flightNum);
            if (!k) continue;
            
            idxFull.set(k, {
              oCode: (f.orig_iata || f.origin_iata || f?.origin?.iata || "").toUpperCase(),
              dCode: (f.dest_iata || f.destination_iata || f?.destination?.iata || "").toUpperCase(),
              lat: typeof f.lat === "number" ? f.lat : null,
              lon: typeof f.lon === "number" ? f.lon : null,
              eta: f.eta || null, // ETA from fr24_full
              timestamp: f.timestamp || null,
            });
          }

          // Get airports for coordinates
          const codesFull = Array.from(
            new Set([...idxFull.values()].flatMap((x) => [x.oCode, x.dCode]).filter(Boolean))
          );
          let airports: Record<string, any> = {};
          if (codesFull.length) {
            const apRes = await fetch(`${baseUrl}?action=airports_public&codes=${encodeURIComponent(codesFull.join(","))}`);
            const apJson = await apRes.json();
            airports = apJson?.data || {};
          }

          const nowTs = Date.now();
          
          // Calculate progress based on timestamp and eta
          const calcProg = (eta: string | null): number => {
            if (!eta) return 0.5;
            const etaTs = new Date(eta).getTime();
            if (!isFinite(etaTs)) return 0.5;
            // Assume flight started ~8h before ETA for international flights
            const estimatedDuration = 8 * 60 * 60 * 1000; // 8 hours default
            const startTs = etaTs - estimatedDuration;
            if (nowTs <= startTs) return 0;
            if (nowTs >= etaTs) return 1;
            return (nowTs - startTs) / (etaTs - startTs);
          };
          
          // Calculate status based on ETA
          const calcStatus = (etaIso: string | null, hasPosition: boolean): "Em trânsito" | "Atraso" | "Entregue" => {
            if (!etaIso) return "Em trânsito";
            const etaTs = new Date(etaIso).getTime();
            if (!isFinite(etaTs)) return "Em trânsito";
            // If past ETA and still has position, it's delayed
            if (nowTs > etaTs && hasPosition) return "Atraso";
            // If past ETA and no position, likely delivered
            if (nowTs > etaTs + 2 * 60 * 60 * 1000 && !hasPosition) return "Entregue";
            return "Em trânsito";
          };

          for (let i = 0; i < seedAir.length; i++) {
            const s = seedAir[i];
            const k = normFlight(s.flight);
            const f = idxFull.get(k) || {};

            const oCode = (f.oCode || "").toUpperCase();
            const dCode = (f.dCode || "").toUpperCase();

            // Skip if no route data
            if (!oCode || !dCode) continue;

            const o = airports[oCode] || null;
            const d = airports[dCode] || null;

            // Skip if no airport coordinates
            if (!o || !d) continue;

            const etaIso = f.eta || null;
            const etaApiHuman = fmtLocalBRDateTime(etaIso) || "—";

            const hasPosition = Number.isFinite(f.lat) && Number.isFinite(f.lon);
            const status = calcStatus(etaIso, hasPosition);
            
            // Skip delivered items older than 24h
            if (status === "Entregue") {
              const etaTs = etaIso ? new Date(etaIso).getTime() : 0;
              if (nowTs > etaTs + 24 * 60 * 60 * 1000) continue;
            }
            
            const pos: [number, number] | null = hasPosition ? [Number(f.lat), Number(f.lon)] : null;

            const rawCliente = s.cliente || "";
            const clienteCorto = String(rawCliente).split(" - ")[0].trim() || rawCliente;

            newData.push({
              id: `air:${i}`,
              mode: "air",
              tipo_label: s.tipo || "Air",
              cliente: clienteCorto,
              rota: `${oCode} → ${dCode}`,
              eta_iso: etaIso,
              eta_api: etaApiHuman,
              ata_iso: status === "Entregue" ? etaIso : null,
              delivered_until_ts: status === "Entregue" && etaIso ? new Date(etaIso).getTime() + 24 * 60 * 60 * 1000 : null,
              status,
              orig: o && Number.isFinite(+o.lat) && Number.isFinite(+o.lon) ? [Number(o.lat), Number(o.lon)] : null,
              dest: d && Number.isFinite(+d.lat) && Number.isFinite(+d.lon) ? [Number(d.lat), Number(d.lon)] : null,
              prog: calcProg(etaIso),
              pos,
              flight: k,
              asset: s.awb || null,
            });
          }
        }
      }

      // SEA data - buscar da tela de monitoramento (t_tracking_sea)
      // Primeiro, sincronizar dados e buscar coordenadas via JSONCARGO em background
      fetch(`${baseUrl}?action=sync_olimpo_from_monitoring`).catch(() => {});
      fetch(`${baseUrl}?action=refresh_sea_tracking_smart`).catch(() => {});
      
      const seaRes = await fetch(`${baseUrl}?action=olimpo_sea_from_monitoring`);
      const seaJson = await seaRes.json();
      const seaArr = Array.isArray(seaJson?.data) ? seaJson.data : [];

      const nowTs = Date.now();

      for (const s of seaArr) {
        const oCode = (s.porto_origem || "").toUpperCase();
        const dCode = (s.porto_destino || "").toUpperCase();
        
        if (!oCode || !dCode) continue;

        // Usar coordenadas pré-salvas do banco (com fallback de portos conhecidos no backend)
        const orig: [number, number] | null = 
          s.origem_lat && s.origem_lon 
            ? [Number(s.origem_lat), Number(s.origem_lon)] 
            : null;
        const dest: [number, number] | null = 
          s.destino_lat && s.destino_lon 
            ? [Number(s.destino_lat), Number(s.destino_lon)] 
            : null;
          
        // Se não tem coordenadas de origem/destino, pular (backend deve fornecer via fallback de portos)
        // Mas não bloqueamos completamente - mostramos com rota se tiver pelo menos uma coordenada
        if (!orig && !dest) continue;

        const etaIso = s.eta ? new Date(s.eta).toISOString() : null;
        const mblId = s.mbl_id || `sea-${newData.length}`;
        
        // Determinar status baseado no container_status e is_eta_delayed
        let status: "Em trânsito" | "Atraso" | "Entregue" = "Em trânsito";
        let deliveredUntilTs: number | null = null;
        
        const containerStatus = (s.container_status || "").toUpperCase();
        const isDelivered = ["DELIVERED", "DLV", "GOD", "EMPTY_RETURNED"].includes(containerStatus);
        
        if (isDelivered) {
          status = "Entregue";
          if (s.last_check) {
            const lastCheckTs = new Date(s.last_check).getTime();
            deliveredUntilTs = lastCheckTs + 24 * 60 * 60 * 1000;
          }
        } else if (s.is_eta_delayed === 1) {
          status = "Atraso";
        } else if (etaIso) {
          const etaTs = new Date(etaIso).getTime();
          if (nowTs > etaTs) {
            status = "Atraso";
          }
        }

        // Posição atual do navio (se disponível)
        const pos: [number, number] | null = 
          s.current_lat && s.current_lon 
            ? [Number(s.current_lat), Number(s.current_lon)] 
            : null;

        // Calcular progresso baseado em ETD e ETA
        const etdIso = s.etd ? new Date(s.etd).toISOString() : null;
        const prog = (() => {
          if (!(etdIso && etaIso)) return 0.5;
          const t0 = new Date(etdIso).getTime();
          const t1 = new Date(etaIso).getTime();
          if (!isFinite(t0) || !isFinite(t1) || t1 <= t0) return 0.5;
          return Math.max(0, Math.min(1, (nowTs - t0) / (t1 - t0)));
        })();

        newData.push({
          id: `sea:${mblId}`,
          mode: "sea",
          tipo_label: s.tipo_processo || "SEA IMPORT",
          cliente: s.consignee || s.cliente || "",
          rota: `${oCode} → ${dCode}`,
          eta_iso: etaIso,
          eta_api: fmtLocalBRDateTime(etaIso) || "—",
          ata_iso: null,
          delivered_until_ts: deliveredUntilTs,
          status,
          orig,
          dest,
          prog,
          pos,
          flight: null,
          asset: mblId,
        });
      }
    } catch (error) {
      console.error("[Olimpo] Error loading data:", error);
    }

    setData(newData);
    setIsLoading(false);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapboxToken || !mapContainerRef.current) return;

    // Cleanup previous map if exists
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-30, 10],
      zoom: 2,
      projection: "mercator", // Forçar 2D - projeção flat
      pitch: 0, // Sem inclinação
      bearing: 0, // Sem rotação
    });

    // Add navigation controls
    map.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: false,
      }),
      "top-right"
    );

    // Modo 2D não precisa de rotação

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken, isFullscreen]);

  // Update map markers and routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      // Wait for style to load
      const checkStyle = () => {
        if (map && map.isStyleLoaded()) {
          updateMapData();
        }
      };
      map?.on("style.load", checkStyle);
      return () => {
        map?.off("style.load", checkStyle);
      };
    }
    updateMapData();

    function updateMapData() {
      if (!map) return;

      // Clear existing markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      // Clear existing sources and layers
      activeSourcesRef.current.forEach(sourceId => {
        if (map.getLayer(`${sourceId}-layer`)) {
          map.removeLayer(`${sourceId}-layer`);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      });
      activeSourcesRef.current = [];

      // Helper function to build route line
      const buildRouteLine = (item: DataItem, routeIndex: number): [number, number][] => {
        let line: [number, number][] = [];
        if (!item.orig || !item.dest) return line;
        
        if (item.mode === "sea") {
          const way = maritimeWaypoints(item.orig, item.dest);
          const seed = hashStr(String(item.asset || item.rota || "sea"));
          const pts = [item.orig, ...way, item.dest];
          for (let i = 1; i < pts.length; i++) {
            const seg = bezierArc(pts[i - 1], pts[i], seed + i, 96, routeIndex);
            if (i > 1) seg.shift();
            line = line.concat(seg);
          }
        } else {
          const seed = hashStr(String(item.asset || item.flight || item.rota || "air"));
          line = bezierArc(item.orig, item.dest, seed, 100, routeIndex);
        }
        return line;
      };

      // Group items by asset
      const groups = new Map<string, DataItem[]>();
      for (const item of filteredData) {
        const key = item.asset || `${item.mode}|${item.rota}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }

      let routeIndex = 0;

      for (const [key, items] of groups.entries()) {
        const item = items[0];
        if (!item.orig || !item.dest) continue;

        const currentRouteIndex = routeIndex;
        routeIndex++;

        // Build route line
        const line = buildRouteLine(item, currentRouteIndex);
        
        // Only show route if this vehicle is selected
        const isSelected = selectedAssetDetails && (
          selectedAssetDetails.asset === item.asset ||
          selectedAssetDetails.flight === item.flight
        );

        if (isSelected && line.length > 1) {
          // Convert to GeoJSON format [lng, lat]
          const coordinates = line.map(([lat, lng]) => [lng, lat]);
          
          const sourceId = `route-${key}-${currentRouteIndex}`;
          
          // Add route source
          map.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates,
              },
            },
          });

          // Add route layer
          map.addLayer({
            id: `${sourceId}-layer`,
            type: "line",
            source: sourceId,
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": item.mode === "air" ? "#7fd0ff" : "#ffc800",
              "line-width": 2,
              "line-opacity": 0.6,
            },
          });

          activeSourcesRef.current.push(sourceId);
        }

        // Calculate marker position
        let pos = item.pos;
        if (!pos && line.length > 1) {
          pos = pointAtFraction(line, item.prog);
        }

        if (pos) {
          // Create marker element
          const el = document.createElement("div");
          el.className = "cursor-pointer";
          el.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.5))";
          el.style.fontSize = "20px";

          if (item.mode === "air") {
            // Determine rotation: IMPORT = 120°, EXPORT = 300°
            const isImport = item.tipo_label.toUpperCase().includes("IMPORT");
            const rotation = isImport ? 120 : 300;
            el.innerHTML = `<i class="fa-solid fa-plane" style="color: #7fd0ff; transform: rotate(${rotation}deg);"></i>`;
          } else {
            el.innerHTML = `<i class="fa-solid fa-ship" style="color: #ffc800;"></i>`;
          }

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([pos[1], pos[0]])
            .addTo(map);

          // Create popup
          const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
            .setHTML(`
              <div style="background: rgba(5,6,18,0.95); color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px;">
                <strong>${item.asset || item.tipo_label}</strong><br/>
                ${item.cliente}<br/>
                ${item.rota}<br/>
                <span style="color: ${item.status === 'Atraso' ? '#ff8b8b' : '#7fd0ff'};">${item.status}</span>
              </div>
            `);

          marker.setPopup(popup);

          // Click handler
          el.addEventListener("click", () => {
            const processos = items.map(it => it.asset).filter(Boolean) as string[];
            setSelectedAssetDetails({
              mode: item.mode,
              asset: item.asset,
              flight: item.flight,
              tipo_label: item.tipo_label,
              cliente: item.cliente,
              rota: item.rota,
              eta_api: item.eta_api,
              status: item.status,
              processos: [...new Set(processos)],
            });
          });

          markersRef.current.push(marker);
        }
      }

      // Fit bounds to show all markers
      if (markersRef.current.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        markersRef.current.forEach(m => bounds.extend(m.getLngLat()));
        map.fitBounds(bounds, { padding: 50, maxZoom: 4 });
      }
    }
  }, [filteredData, mapboxToken, selectedAssetDetails]);

  // Load data on mount
  useEffect(() => {
    loadMapboxToken();
    loadData();
    loadMasterContainerCount();
  }, [loadMapboxToken, loadData, loadMasterContainerCount]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      setTimeout(() => {
        mapRef.current?.resize();
      }, 100);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [isFullscreen]);

  // Fullscreen overlay content
  const fullscreenOverlay = isFullscreen ? (
    <>
      {/* Floating panel - filters + KPIs at top center */}
      <div 
        className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] rounded-xl flex flex-col w-[95vw] max-w-[900px]"
        style={{
          background: 'rgba(5,6,18,.92)',
          border: '1px solid rgba(255,255,255,.12)',
          boxShadow: '0 12px 32px rgba(0,0,0,.7)',
        }}
      >
        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-white/[0.08]">
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-44 rounded-full bg-[rgba(14,14,14,0.96)] border-white/20 text-xs h-8"
          />
          <button
            onClick={() => setDaysFilter(daysFilter === 7 ? null : 7)}
            className={`px-3 py-1.5 rounded-full text-[10px] border transition-all flex items-center gap-1.5 ${daysFilter === 7 ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary" /> 7d
          </button>
          <button
            onClick={() => setDaysFilter(daysFilter === 30 ? null : 30)}
            className={`px-3 py-1.5 rounded-full text-[10px] border transition-all flex items-center gap-1.5 ${daysFilter === 30 ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary" /> 30d
          </button>
          <button
            onClick={() => setModeFilter(modeFilter === "air" ? null : "air")}
            className={`px-3 py-1.5 rounded-full text-[10px] border transition-all flex items-center gap-1.5 ${modeFilter === "air" ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary" /> AIR
          </button>
          <button
            onClick={() => setModeFilter(modeFilter === "sea" ? null : "sea")}
            className={`px-3 py-1.5 rounded-full text-[10px] border transition-all flex items-center gap-1.5 ${modeFilter === "sea" ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary" /> SEA
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === "Atraso" ? null : "Atraso")}
            className={`px-3 py-1.5 rounded-full text-[10px] border transition-all flex items-center gap-1.5 ${statusFilter === "Atraso" ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Atraso
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setIsFullscreen(false)}
            className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center bg-black/50 text-white hover:bg-black/70 transition-all"
          >
            <Minimize2 size={14} />
          </button>
        </div>

        {/* KPI cards row */}
        <div className="flex gap-3 p-3">
          <div className="bg-[#151515] rounded-lg px-4 py-3 border border-white/[0.06] flex-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">Containers</p>
            <p className="text-xl font-semibold">{kpis.seaTransit}</p>
          </div>
          <div className="bg-[#151515] rounded-lg px-4 py-3 border border-white/[0.06] flex-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">Voos</p>
            <p className="text-xl font-semibold">{kpis.airActive}</p>
          </div>
          <div className="bg-[#151515] rounded-lg px-4 py-3 border border-white/[0.06] flex-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">Total</p>
            <p className="text-xl font-semibold">{kpis.seaTransit + kpis.airActive}</p>
          </div>
          <div className="bg-[#151515] rounded-lg px-4 py-3 border border-white/[0.06] flex-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">Atrasos</p>
            <p className="text-xl font-semibold text-[#ff8b8b]">{kpis.delayed}</p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 text-[10px] text-muted-foreground px-2 py-1 rounded-full bg-black/85 border border-white/10 z-[1000]">
        <span className="w-2 h-2 rounded-full bg-primary" /> SEA
        <span className="w-2 h-2 rounded-full bg-[#7fd0ff]" /> AIR
      </div>

      {/* Asset Details Panel */}
      {selectedAssetDetails && (
        <div 
          className="absolute right-4 top-4 w-72 max-h-[50vh] z-[1000] rounded-xl flex flex-col overflow-hidden"
          style={{
            background: 'rgba(5,6,18,.95)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,.85)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedAssetDetails.mode === 'air' ? 'bg-[#7fd0ff]/20' : 'bg-primary/20'}`}>
                {selectedAssetDetails.mode === 'air' ? (
                  <Plane size={16} className="text-[#7fd0ff]" />
                ) : (
                  <Ship size={16} className="text-primary" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  {selectedAssetDetails.mode === 'air' ? 'Avião' : 'Navio'}
                </p>
                <p className="font-semibold text-sm">
                  {selectedAssetDetails.flight || selectedAssetDetails.asset || 'N/A'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedAssetDetails(null)}
              className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center bg-black/50 text-muted-foreground hover:text-white transition-all"
            >
              <X size={12} />
            </button>
          </div>

          {/* Badge */}
          <div className="px-3 pt-3">
            <Badge 
              variant="outline" 
              className={`${selectedAssetDetails.mode === 'air' ? 'border-[#7fd0ff]/70 text-[#b7e2ff]' : 'border-primary/70 text-primary'}`}
            >
              {selectedAssetDetails.tipo_label} • {selectedAssetDetails.flight || selectedAssetDetails.asset || 'N/A'}
            </Badge>
          </div>

          {/* Details */}
          <div className="p-3 space-y-2 text-sm overflow-y-auto">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-medium">{selectedAssetDetails.cliente}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rota</span>
              <span className="font-medium">{selectedAssetDetails.rota}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Previsão</span>
              <span className="font-medium">{selectedAssetDetails.eta_api}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className={`px-2 py-0.5 rounded text-xs ${selectedAssetDetails.status === 'Atraso' ? 'bg-red-500/20 text-red-400' : selectedAssetDetails.status === 'Entregue' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                {selectedAssetDetails.status}
              </span>
            </div>

            {/* Processos */}
            <div className="pt-2 border-t border-white/[0.05]">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Processos ({selectedAssetDetails.processos.length})
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedAssetDetails.processos.length > 0 ? (
                  selectedAssetDetails.processos.map((awb, idx) => (
                    <div key={idx} className="text-xs px-2 py-1 bg-white/[0.03] rounded border border-white/[0.06]">
                      {awb}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground italic">Nenhum processo</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  ) : null;

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-[#02040a]">
        <div ref={mapContainerRef} className="absolute inset-0" />
        {fullscreenOverlay}
      </div>
    );
  }

  // Normal mode
  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${dachserBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 20% 20%, rgba(245, 184, 67, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 80%, rgba(245, 184, 67, 0.08) 0%, transparent 50%)
            `,
          }}
        />
        {/* Animated Lines */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(6)].map((_, i) => (
            <div
              key={`line-${i}`}
              className="absolute h-full w-px bg-gradient-to-b from-[#ffc800]/70 to-[#ffc800]/10"
              style={{ left: `${15 + i * 14}%`, transform: `skewX(${-20 + i * 8}deg)` }}
            />
          ))}
        </div>
        {/* Floating Particles */}
        {[...Array(20)].map((_, i) => (
          <div
            key={`particle-${i}`}
            className="absolute w-1 h-1 rounded-full bg-[#ffc800]/40 animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${4 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Layout */}
      <div className="relative z-10 flex flex-col h-screen p-3 md:p-4 lg:p-6 gap-3 md:gap-4 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={handleBack}
              className="w-7 h-7 md:w-8 md:h-8 rounded-full border border-[rgba(255,255,255,.12)] bg-[rgba(5,6,18,0.9)] text-[#aaaaaa] flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
              title={isOlimpoOnly ? "Sair" : "Voltar"}
            >
              <ArrowLeft size={14} />
            </button>
            <div>
              <h1 className="text-lg md:text-xl lg:text-2xl font-bold tracking-[0.22em]">DACHSER</h1>
              <p className="text-[10px] md:text-xs lg:text-sm text-muted-foreground hidden sm:block">Intelligent Logistics – Movimentação Global</p>
              <div className="flex gap-1.5 md:gap-2 mt-1">
                <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-primary/70" />
                <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-primary/40" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="px-2 md:px-4 py-1 md:py-1.5 rounded-full bg-background/65 border border-border/30 text-muted-foreground text-[10px] md:text-sm">
              @{user?.username || "usuario"}
            </div>
            {isOlimpoOnly ? (
              <button
                onClick={handleLogout}
                className="w-7 h-7 md:w-9 md:h-9 rounded-full border border-border/50 flex items-center justify-center bg-background/70 text-primary hover:bg-background hover:shadow-[0_0_12px_hsl(var(--primary)/0.6)] transition-all duration-200"
                title="Sair"
              >
                <LogOut size={14} />
              </button>
            ) : (
              <div
                className="w-7 h-7 md:w-9 md:h-9 rounded-full border border-border/50 flex items-center justify-center bg-background/70 text-primary"
                title="Movimentação Global"
              >
                <Globe size={14} />
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
          {/* Map Card */}
          <div 
            className="rounded-2xl flex flex-col overflow-hidden flex-1 min-h-[300px] lg:min-h-0"
            style={{
              background: 'rgba(5,6,18,.9)',
              border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 18px 40px rgba(0,0,0,.85)',
            }}
          >
            <div className="flex items-center justify-between p-3 md:p-4 border-b border-white/[0.08]">
              <div>
                <h2 className="text-xs md:text-sm tracking-[0.16em] uppercase text-white/90">Air & Sea Movements</h2>
                <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Origem x Destino com rotas em tempo quase real</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-[rgba(135,206,250,0.7)] text-[#b7e2ff] text-[10px] md:text-xs">
                  AIR
                </Badge>
                <Badge variant="outline" className="border-[rgba(64,224,208,0.7)] text-[#a4fff4] text-[10px] md:text-xs">
                  SEA
                </Badge>
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="w-7 h-7 md:w-8 md:h-8 rounded-full border border-white/20 flex items-center justify-center bg-black/70 text-primary hover:bg-black/90 transition-all"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 relative bg-[#02040a] m-2 md:m-3 rounded-[18px] overflow-hidden min-h-[200px]">
              <div ref={mapContainerRef} className="absolute inset-0" />
              <div className="absolute bottom-2 md:bottom-4 left-2 md:left-4 flex items-center gap-2 text-[10px] md:text-xs text-muted-foreground px-2 py-1 rounded-full bg-black/85 border border-white/10 z-[1000]">
                <span className="w-2 h-2 rounded-full bg-primary" /> SEA
                <span className="w-2 h-2 rounded-full bg-[#7fd0ff]" /> AIR
              </div>

              {/* Asset Details Panel */}
              {selectedAssetDetails && (
                <div 
                  className="absolute right-3 top-3 w-72 max-h-[calc(100%-24px)] z-[1000] rounded-xl flex flex-col overflow-hidden"
                  style={{
                    background: 'rgba(5,6,18,.95)',
                    border: '1px solid rgba(255,255,255,.15)',
                    boxShadow: '0 12px 32px rgba(0,0,0,.7)',
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between p-2.5 border-b border-white/[0.08]">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${selectedAssetDetails.mode === 'air' ? 'bg-[#7fd0ff]/20' : 'bg-primary/20'}`}>
                        {selectedAssetDetails.mode === 'air' ? (
                          <Plane size={14} className="text-[#7fd0ff]" />
                        ) : (
                          <Ship size={14} className="text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {selectedAssetDetails.mode === 'air' ? 'Avião' : 'Navio'}
                        </p>
                        <p className="font-semibold text-xs">
                          {selectedAssetDetails.flight || selectedAssetDetails.asset || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedAssetDetails(null)}
                      className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center bg-black/50 text-muted-foreground hover:text-white transition-all"
                    >
                      <X size={10} />
                    </button>
                  </div>

                  {/* Scrollable content */}
                  <div className="flex-1 overflow-y-auto">
                    {/* Badge */}
                    <div className="px-2.5 pt-2">
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] ${selectedAssetDetails.mode === 'air' ? 'border-[#7fd0ff]/70 text-[#b7e2ff]' : 'border-primary/70 text-primary'}`}
                      >
                        {selectedAssetDetails.tipo_label} • {selectedAssetDetails.flight || selectedAssetDetails.asset || 'N/A'}
                      </Badge>
                    </div>

                    {/* Details */}
                    <div className="p-2.5 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rota</span>
                        <span className="font-medium">{selectedAssetDetails.rota}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Previsão</span>
                        <span className="font-medium">{selectedAssetDetails.eta_api}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${selectedAssetDetails.status === 'Atraso' ? 'bg-red-500/20 text-red-400' : selectedAssetDetails.status === 'Entregue' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {selectedAssetDetails.status}
                        </span>
                      </div>
                    </div>

                    {/* Processos (AWBs) */}
                    <div className="p-2.5 border-t border-white/[0.05]">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                        Processos ({selectedAssetDetails.processos.length})
                      </p>
                      <div className="space-y-1">
                        {selectedAssetDetails.processos.length > 0 ? (
                          selectedAssetDetails.processos.map((awb, idx) => (
                            <div key={idx} className="text-[10px] px-1.5 py-1 bg-white/[0.03] rounded border border-white/[0.06]">
                              {awb}
                            </div>
                          ))
                        ) : (
                          <p className="text-[10px] text-muted-foreground italic">Nenhum processo</p>
                        )}
                      </div>
                    </div>

                    {/* Faturamento */}
                    <div className="p-2.5 border-t border-white/[0.05]">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Faturamento</p>
                      <p className="text-[10px] text-muted-foreground italic">Em desenvolvimento...</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Side Card (Filters + KPIs) */}
          <div 
            className="rounded-2xl flex flex-col shrink-0 lg:w-80 xl:w-96 overflow-hidden max-h-full"
            style={{
              background: 'rgba(5,6,18,.9)',
              border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 18px 40px rgba(0,0,0,.85)',
            }}
          >
            <div className="p-3 md:p-4 border-b border-white/[0.08] shrink-0">
              <h2 className="text-xs md:text-sm tracking-[0.16em] uppercase text-white/90">Visão de Filtros</h2>
              <p className="text-[10px] md:text-xs text-muted-foreground">Refine a visualização do mapa e do resumo</p>
            </div>

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="p-2 md:p-3 flex flex-wrap gap-1.5 md:gap-2 border-b border-white/[0.05]">
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 min-w-[100px] rounded-full bg-[rgba(14,14,14,0.96)] border-white/20 text-xs md:text-sm h-8"
                />
                <button
                  onClick={() => setDaysFilter(daysFilter === 7 ? null : 7)}
                  className={`px-2 md:px-3 py-1 md:py-1.5 rounded-full text-[10px] md:text-xs border transition-all flex items-center gap-1 ${daysFilter === 7 ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" /> 7d
                </button>
                <button
                  onClick={() => setDaysFilter(daysFilter === 30 ? null : 30)}
                  className={`px-2 md:px-3 py-1 md:py-1.5 rounded-full text-[10px] md:text-xs border transition-all flex items-center gap-1 ${daysFilter === 30 ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" /> 30d
                </button>
                <button
                  onClick={() => setModeFilter(modeFilter === "air" ? null : "air")}
                  className={`px-2 md:px-3 py-1 md:py-1.5 rounded-full text-[10px] md:text-xs border transition-all flex items-center gap-1 ${modeFilter === "air" ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" /> AIR
                </button>
                <button
                  onClick={() => setModeFilter(modeFilter === "sea" ? null : "sea")}
                  className={`px-2 md:px-3 py-1 md:py-1.5 rounded-full text-[10px] md:text-xs border transition-all flex items-center gap-1 ${modeFilter === "sea" ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" /> SEA
                </button>
                <button
                  onClick={() => setStatusFilter(statusFilter === "Atraso" ? null : "Atraso")}
                  className={`px-2 md:px-3 py-1 md:py-1.5 rounded-full text-[10px] md:text-xs border transition-all flex items-center gap-1 ${statusFilter === "Atraso" ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Atraso
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 md:gap-3 p-3 md:p-4">
                <div className="bg-[#151515] rounded-xl p-2 md:p-3 border border-white/[0.06]">
                  <p className="text-[9px] md:text-[0.72rem] text-muted-foreground uppercase tracking-[0.14em]">Containers</p>
                  <p className="text-base md:text-lg font-semibold">{kpis.seaTransit}</p>
                  <p className="text-[9px] md:text-xs text-[#7fd0ff]">Em trânsito</p>
                </div>
                <div className="bg-[#151515] rounded-xl p-2 md:p-3 border border-white/[0.06]">
                  <p className="text-[9px] md:text-[0.72rem] text-muted-foreground uppercase tracking-[0.14em]">Voos</p>
                  <p className="text-base md:text-lg font-semibold">{kpis.airActive}</p>
                  <p className="text-[9px] md:text-xs text-[#7fd0ff]">Ativos</p>
                </div>
                <div className="bg-[#151515] rounded-xl p-2 md:p-3 border border-white/[0.06]">
                  <p className="text-[9px] md:text-[0.72rem] text-muted-foreground uppercase tracking-[0.14em]">Total</p>
                  <p className="text-base md:text-lg font-semibold">{kpis.seaTransit + kpis.airActive}</p>
                  <p className="text-[9px] md:text-xs text-[#7fd0ff]">SEA + AIR</p>
                </div>
                <div className="bg-[#151515] rounded-xl p-2 md:p-3 border border-white/[0.06]">
                  <p className="text-[9px] md:text-[0.72rem] text-muted-foreground uppercase tracking-[0.14em]">Atrasos</p>
                  <p className="text-base md:text-lg font-semibold">{kpis.delayed}</p>
                  <p className="text-[9px] md:text-xs text-[#ff8b8b]">Impacto</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Table */}
        <div 
          className="rounded-2xl h-[28vh] md:h-[32vh] min-h-[180px] md:min-h-[210px] flex flex-col shrink-0"
          style={{
            background: 'rgba(5,6,18,.9)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,.85)',
          }}
        >
          <div className="flex items-center justify-between p-3 md:p-4 border-b border-white/[0.08] shrink-0">
            <div>
              <h2 className="text-xs md:text-sm tracking-[0.16em] uppercase text-white/90">Resumo de Movimentações</h2>
              <p className="text-[10px] md:text-xs text-muted-foreground">{aggregatedData.length} registros agrupados</p>
            </div>
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>

          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-[10px] md:text-xs text-muted-foreground">Tipo</TableHead>
                  <TableHead className="text-[10px] md:text-xs text-muted-foreground">Cliente</TableHead>
                  <TableHead className="text-[10px] md:text-xs text-muted-foreground">Rota</TableHead>
                  <TableHead className="text-[10px] md:text-xs text-muted-foreground">Previsão</TableHead>
                  <TableHead className="text-[10px] md:text-xs text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Carregando dados...
                    </TableCell>
                  </TableRow>
                ) : paginatedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedData.map((row) => (
                    <TableRow key={row.key} className="border-white/[0.04] hover:bg-white/[0.02]">
                      <TableCell className="text-[10px] md:text-xs">
                        <Badge variant="outline" className={`text-[9px] md:text-[10px] ${row.mode === 'air' ? 'border-[#7fd0ff]/50 text-[#b7e2ff]' : 'border-primary/50 text-primary'}`}>
                          {row.tipo_label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] md:text-xs max-w-[120px] md:max-w-[150px] truncate">{row.cliente}</TableCell>
                      <TableCell className="text-[10px] md:text-xs">{row.rota}</TableCell>
                      <TableCell className="text-[10px] md:text-xs">{row.eta_api}</TableCell>
                      <TableCell>
                        <span className={`text-[9px] md:text-[10px] px-1.5 py-0.5 rounded ${row.status === 'Atraso' ? 'bg-red-500/20 text-red-400' : row.status === 'Entregue' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {row.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
