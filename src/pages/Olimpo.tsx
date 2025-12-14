import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Maximize2, Minimize2, Globe, X, Plane, Ship } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import dachserBg from "@/assets/dachser-background.jpg";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

function pointAtFraction(line: [number, number][], t: number, map: L.Map): [number, number] {
  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = map.distance(line[i - 1], line[i]);
    segLen.push(d);
    total += d;
  }
  const target = t * total;
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const p = L.latLng(line[i - 1]);
    const q = L.latLng(line[i]);
    const d = segLen[i - 1];
    if (acc + d >= target) {
      const r = (target - acc) / d;
      return [p.lat + (q.lat - p.lat) * r, p.lng + (q.lng - p.lng) * r];
    }
    acc += d;
  }
  return line[line.length - 1];
}

export default function Olimpo() {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const activeRouteRef = useRef<L.Polyline | null>(null);
  const activeMarkersRef = useRef<L.CircleMarker[]>([]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<DataItem[]>([]);
  const [selectedAssetDetails, setSelectedAssetDetails] = useState<SelectedAssetDetails | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Filters
  const [daysFilter, setDaysFilter] = useState<number | null>(7);
  const [modeFilter, setModeFilter] = useState<"air" | "sea" | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  // Filter data
  const filteredData = data.filter((item) => {
    const now = Date.now();

    // Filter items without complete route or ETA
    const hasValidRoute = item.rota && !item.rota.includes("—") && item.rota.includes("→");
    const hasValidEta = item.eta_api && item.eta_api !== "—" && item.eta_api.trim() !== "";
    if (!hasValidRoute || !hasValidEta) return false;

    // Filter delivered items that are too old
    if (item.status === "Entregue") {
      if (item.delivered_until_ts && now > item.delivered_until_ts) return false;
      if (item.ata_iso) {
        const limit = new Date(item.ata_iso).getTime() + 24 * 60 * 60 * 1000;
        if (now > limit) return false;
      }
    } else if (daysFilter && item.eta_iso) {
      const d = new Date(item.eta_iso);
      const start = new Date(now - daysFilter * 24 * 60 * 60 * 1000);
      const end = new Date(now + daysFilter * 24 * 60 * 60 * 1000);
      if (d < start || d > end) return false;
    }

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

  // KPIs
  const kpis = {
    seaTransit: filteredData.filter((i) => i.mode === "sea" && i.status === "Em trânsito").length,
    airActive: filteredData.filter((i) => i.mode === "air" && i.status !== "Entregue").length,
    delayed: filteredData.filter((i) => i.status === "Atraso").length,
    onTime: filteredData.length
      ? Math.round(((filteredData.length - filteredData.filter((i) => i.status === "Atraso").length) / filteredData.length) * 100)
      : 0,
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(aggregatedData.length / pageSize));
  const paginatedData = aggregatedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
          // Get live positions
          const fullRes = await fetch(`${baseUrl}?action=fr24_full&flights=${encodeURIComponent(flightsCsv)}&batch=12&retries=3`);
          const fullJson = await fullRes.json();
          const fullArr = Array.isArray(fullJson?.data) ? fullJson.data : [];

          const idxFull = new Map<string, any>();
          for (const f of fullArr) {
            const k = normFlight(f.flight || f.number || f?.identification?.number?.default || f.callsign || "");
            if (!k) continue;
            idxFull.set(k, {
              oCode: (f.orig_iata || f.origin_iata || f?.origin?.iata || "").toUpperCase(),
              dCode: (f.dest_iata || f.destination_iata || f?.destination?.iata || "").toUpperCase(),
              lat: typeof f.lat === "number" ? f.lat : null,
              lon: typeof f.lon === "number" ? f.lon : null,
            });
          }

          // Get airports
          const codesFull = Array.from(
            new Set([...idxFull.values()].flatMap((x) => [x.oCode, x.dCode]).filter(Boolean))
          );
          let airports: Record<string, any> = {};
          if (codesFull.length) {
            const apRes = await fetch(`${baseUrl}?action=airports_public&codes=${encodeURIComponent(codesFull.join(","))}`);
            const apJson = await apRes.json();
            airports = apJson?.data || {};
          }

          // Get summary
          const sumRes = await fetch(`${baseUrl}?action=fr24_summary&flights=${encodeURIComponent(flightsCsv)}&batch=12&retries=3`);
          const sumJson = await sumRes.json();
          const sumArr = Array.isArray(sumJson?.data) ? sumJson.data : [];

          const idxSum = new Map<string, any>();
          for (const s of sumArr) {
            const baseCode = s.flight || s.flight_number || s?.identification?.number?.default || s.number || "";
            const k = normFlight(baseCode);
            if (!k) continue;

            const depIata = s?.departure?.airport?.iata || s?.departure?.iata || s?.origin_iata || "";
            const arrIata = s?.arrival?.airport?.iata || s?.arrival?.iata || s?.destination_iata || "";

            const etaIso = s?.arrival?.estimated_time_utc || s?.eta || s?.arrival?.scheduled_time_utc || null;
            const ataIso = s?.arrival?.actual_time_utc || s?.ata || null;
            const atdIso = s?.departure?.actual_time_utc || s?.atd || null;

            idxSum.set(k, {
              atd: atdIso,
              eta: etaIso,
              ata: ataIso,
              flight_ended: !!s.flight_ended,
              oCode: depIata?.toUpperCase() || null,
              dCode: arrIata?.toUpperCase() || null,
            });
          }

          // Missing airports
          const missingCodes = Array.from(
            new Set([...idxFull.values(), ...idxSum.values()].flatMap((x) => [x.oCode, x.dCode]).filter((c) => c && !(c in airports)))
          );
          if (missingCodes.length) {
            const ap2Res = await fetch(`${baseUrl}?action=airports_public&codes=${encodeURIComponent(missingCodes.join(","))}`);
            const ap2Json = await ap2Res.json();
            airports = { ...airports, ...(ap2Json?.data || {}) };
          }

          const nowTs = Date.now();
          const calcProg = (atdIso: string | null, etaIso: string | null) => {
            const t0 = atdIso ? new Date(atdIso).getTime() : NaN;
            const t1 = etaIso ? new Date(etaIso).getTime() : NaN;
            if (!isFinite(t0) || !isFinite(t1) || t1 <= t0) return 0.5;
            return Math.max(0, Math.min(1, (nowTs - t0) / (t1 - t0)));
          };
          const calcStatus = (etaIso: string | null, ended: boolean): "Em trânsito" | "Atraso" | "Entregue" => {
            if (ended) return "Entregue";
            const t1 = etaIso ? new Date(etaIso).getTime() : NaN;
            if (isFinite(t1) && nowTs > t1) return "Atraso";
            return "Em trânsito";
          };

          for (let i = 0; i < seedAir.length; i++) {
            const s = seedAir[i];
            const k = normFlight(s.flight);
            const f = idxFull.get(k) || {};
            const sum = idxSum.get(k) || {};

            const oCode = (f.oCode || sum.oCode || "").toUpperCase() || "—";
            const dCode = (f.dCode || sum.dCode || "").toUpperCase() || "—";

            const o = airports[oCode] || null;
            const d = airports[dCode] || null;

            const etaIso = sum.eta || null;
            const ataIso = sum.ata || null;
            const etaApiHuman = fmtLocalBRDateTime(ataIso || etaIso) || "—";

            const deliveredUntilTs = ataIso ? new Date(ataIso).getTime() + 24 * 60 * 60 * 1000 : null;
            const status = calcStatus(etaIso, !!sum.flight_ended);
            const pos: [number, number] | null =
              status !== "Entregue" && Number.isFinite(f.lat) && Number.isFinite(f.lon) ? [Number(f.lat), Number(f.lon)] : null;

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
              ata_iso: ataIso,
              delivered_until_ts: deliveredUntilTs,
              status,
              orig: o && Number.isFinite(+o.lat) && Number.isFinite(+o.lon) ? [Number(o.lat), Number(o.lon)] : null,
              dest: d && Number.isFinite(+d.lat) && Number.isFinite(+d.lon) ? [Number(d.lat), Number(d.lon)] : null,
              prog: calcProg(sum.atd || null, etaIso),
              pos,
              flight: k,
              asset: s.awb || null,
            });
          }
        }
      }

      // Load SEA data with smart cache
      const seaSeedRes = await fetch(`${baseUrl}?action=sea_seed_smart`);
      const seaSeedJson = await seaSeedRes.json();
      const seedSea = Array.isArray(seaSeedJson?.data) ? seaSeedJson.data : [];

      for (const s of seedSea) {
        const containerId = s.container;
        const etaIso = s.eta_final_destination ? new Date(s.eta_final_destination).toISOString() : null;
        
        let status: "Em trânsito" | "Atraso" | "Entregue" = "Em trânsito";
        const stText = (s.container_status || "").toLowerCase();
        if (/delivered|gate out|empty received/.test(stText)) status = "Entregue";
        else if (etaIso && Date.now() > new Date(etaIso).getTime()) status = "Atraso";

        const lastMovIso = s.last_movement_timestamp ? new Date(s.last_movement_timestamp).toISOString() : null;
        const deliveredUntilTs = status === "Entregue" && lastMovIso ? new Date(lastMovIso).getTime() + 24 * 60 * 60 * 1000 : null;

        const orig: [number, number] | null = 
          s.origin_lat && s.origin_lon ? [Number(s.origin_lat), Number(s.origin_lon)] : null;
        const dest: [number, number] | null = 
          s.dest_lat && s.dest_lon ? [Number(s.dest_lat), Number(s.dest_lon)] : null;
        const pos: [number, number] | null = 
          s.vessel_lat && s.vessel_lon && status !== "Entregue" ? [Number(s.vessel_lat), Number(s.vessel_lon)] : null;

        const oCode = s.origin_unlocode || "—";
        const dCode = s.dest_unlocode || "—";

        newData.push({
          id: `sea:${containerId}`,
          mode: "sea",
          tipo_label: "SEA IMPORT",
          cliente: s.cliente || "",
          rota: `${oCode} → ${dCode}`,
          eta_iso: etaIso,
          eta_api: fmtLocalBRDateTime(etaIso) || "—",
          ata_iso: null,
          delivered_until_ts: deliveredUntilTs,
          status,
          orig,
          dest,
          prog: (() => {
            const atdIso = s.atd_origin ? new Date(s.atd_origin).toISOString() : null;
            if (!(atdIso && etaIso)) return 0.5;
            const now = Date.now();
            const t0 = new Date(atdIso).getTime();
            const t1 = new Date(etaIso).getTime();
            if (!isFinite(t0) || !isFinite(t1) || t1 <= t0) return 0.5;
            return Math.max(0, Math.min(1, (now - t0) / (t1 - t0)));
          })(),
          pos,
          flight: null,
          asset: containerId,
        });
      }
    } catch (error) {
      console.error("[Olimpo] Error loading data:", error);
    }

    setData(newData);
    setIsLoading(false);
  }, []);

  // Initialize map - recreate when switching fullscreen mode
  useEffect(() => {
    // Cleanup previous map if exists
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      worldCopyJump: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      zoomAnimation: true,
      markerZoomAnimation: true,
      fadeAnimation: true,
      doubleClickZoom: false,
      scrollWheelZoom: true,
      maxBoundsViscosity: 1.0,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap, &copy; CARTO",
      subdomains: "abcd",
      noWrap: false,
    }).addTo(map);

    // Set initial view to show the world
    map.setView([20, 0], 2);

    mapRef.current = map;

    // Force invalidateSize after a short delay to ensure proper rendering
    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isFullscreen]);

  // Update map markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });
    activeRouteRef.current = null;
    activeMarkersRef.current = [];

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

    // Helper to show route for selected item
    const showRoute = (item: DataItem, routeIndex: number, allGroups: Map<string, DataItem[]>) => {
      // Clear previous route
      if (activeRouteRef.current) {
        map.removeLayer(activeRouteRef.current);
      }
      activeMarkersRef.current.forEach(m => map.removeLayer(m));
      activeMarkersRef.current = [];

      if (!item.orig || !item.dest) return;

      const line = buildRouteLine(item, routeIndex);
      const baseColor = item.mode === "air" ? "#7fd0ff" : "#ffc800";

      if (line.length > 1) {
        activeRouteRef.current = L.polyline(line, { 
          color: baseColor, 
          weight: 2.5, 
          opacity: 0.85 
        }).addTo(map);

        // Add origin/destination markers
        const originMarker = L.circleMarker(item.orig, {
          radius: 6,
          fillColor: "#22c55e",
          fillOpacity: 0.9,
          color: "#fff",
          weight: 2,
        }).addTo(map);

        const destMarker = L.circleMarker(item.dest, {
          radius: 6,
          fillColor: "#ef4444",
          fillOpacity: 0.9,
          color: "#fff",
          weight: 2,
        }).addTo(map);

        activeMarkersRef.current = [originMarker, destMarker];
      }

      // Collect all AWBs/containers in this group
      const groupKey = item.asset || `${item.mode}|${item.rota}`;
      const groupItems = allGroups.get(groupKey) || [item];
      const processos = groupItems.map(it => it.asset).filter(Boolean) as string[];

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
    };

    // Clear route when clicking on map (not marker)
    const clearRoute = () => {
      if (activeRouteRef.current) {
        map.removeLayer(activeRouteRef.current);
        activeRouteRef.current = null;
      }
      activeMarkersRef.current.forEach(m => map.removeLayer(m));
      activeMarkersRef.current = [];
      setSelectedAssetDetails(null);
    };

    map.on('click', clearRoute);

    // Group items by asset
    const groups = new Map<string, DataItem[]>();
    for (const item of filteredData) {
      const key = item.asset || `${item.mode}|${item.rota}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    const markers: L.Marker[] = [];
    let routeIndex = 0;

    // Sort groups by destination to cluster similar routes
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      const aItem = a[1][0];
      const bItem = b[1][0];
      const aDest = aItem.dest ? aItem.dest[0] * 1000 + aItem.dest[1] : 0;
      const bDest = bItem.dest ? bItem.dest[0] * 1000 + bItem.dest[1] : 0;
      return aDest - bDest;
    });

    for (const [, items] of sortedGroups) {
      const item = items[0];
      if (!item.orig || !item.dest) continue;

      const currentRouteIndex = routeIndex;
      routeIndex++;

      // Calculate position along route
      const line = buildRouteLine(item, currentRouteIndex);
      let pos = item.pos;
      if (!pos && line.length > 1) {
        pos = pointAtFraction(line, item.prog, map);
      }

      if (pos) {
        // Use deterministic offset based on route index to spread overlapping markers
        const offsetAngle = (currentRouteIndex * 45) * (Math.PI / 180); // 45 degrees per route
        const offsetDistance = 0.8 + (currentRouteIndex % 5) * 0.3; // 0.8 to 2.0 degrees
        const latOffset = item.mode === "air" ? Math.sin(offsetAngle) * offsetDistance : 0;
        const lngOffset = item.mode === "air" ? Math.cos(offsetAngle) * offsetDistance : 0;
        const offsetPos: [number, number] = [pos[0] + latOffset, pos[1] + lngOffset];

        const icon = L.divIcon({
          html: item.mode === "air" ? "✈️" : "🚢",
          className: "cursor-pointer hover:scale-125 transition-transform",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        
        const marker = L.marker(offsetPos, { icon }).addTo(map);
        
        // Show route on click
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          showRoute(item, currentRouteIndex, groups);
        });

        // Tooltip with info
        marker.bindTooltip(
          `<div class="text-xs">
            <strong>${item.asset || item.tipo_label}</strong><br/>
            ${item.cliente}<br/>
            ${item.rota}<br/>
            <span class="${item.status === 'Atraso' ? 'text-red-400' : 'text-green-400'}">${item.status}</span>
          </div>`,
          { 
            direction: 'top', 
            offset: [0, -10],
            className: 'bg-[#0a0a0a] border border-white/20 rounded-lg shadow-lg'
          }
        );

        markers.push(marker);
      }
    }

    // Fit bounds with better padding
    if (markers.length > 0) {
      const fg = L.featureGroup(markers);
      map.flyToBounds(fg.getBounds().pad(0.25), { maxZoom: 4, duration: 0.5 });
    }

    return () => {
      map.off('click', clearRoute);
    };
  }, [filteredData]);

  // Resize map on fullscreen toggle or window resize
  useEffect(() => {
    const handleResize = () => {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [isFullscreen]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fullscreen mode - map takes entire screen
  // Fullscreen overlay content (renders inside portal-like structure)
  const fullscreenOverlay = isFullscreen ? (
    <>
      {/* Floating panel - filters + KPIs at top left - same as normal mode */}
      <div 
        className="absolute top-4 left-4 z-[1000] rounded-xl flex flex-col w-80 max-h-[50vh]"
        style={{
          background: 'rgba(5,6,18,.92)',
          border: '1px solid rgba(255,255,255,.12)',
          boxShadow: '0 12px 32px rgba(0,0,0,.7)',
        }}
      >
        <div className="p-3 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h2 className="text-xs tracking-[0.16em] uppercase text-white/90">Visão de Filtros</h2>
            <p className="text-[10px] text-muted-foreground">Refine a visualização</p>
          </div>
          <button
            onClick={() => setIsFullscreen(false)}
            className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center bg-black/50 text-white hover:bg-black/70 transition-all"
          >
            <Minimize2 size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Filter buttons */}
          <div className="p-2 flex flex-wrap gap-1.5 border-b border-white/[0.05]">
            <Input
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-[100px] rounded-full bg-[rgba(14,14,14,0.96)] border-white/20 text-xs h-8"
            />
            <button
              onClick={() => setDaysFilter(daysFilter === 7 ? null : 7)}
              className={`px-2 py-1 rounded-full text-[10px] border transition-all flex items-center gap-1 ${daysFilter === 7 ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary" /> 7d
            </button>
            <button
              onClick={() => setDaysFilter(daysFilter === 30 ? null : 30)}
              className={`px-2 py-1 rounded-full text-[10px] border transition-all flex items-center gap-1 ${daysFilter === 30 ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary" /> 30d
            </button>
            <button
              onClick={() => setModeFilter(modeFilter === "air" ? null : "air")}
              className={`px-2 py-1 rounded-full text-[10px] border transition-all flex items-center gap-1 ${modeFilter === "air" ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary" /> AIR
            </button>
            <button
              onClick={() => setModeFilter(modeFilter === "sea" ? null : "sea")}
              className={`px-2 py-1 rounded-full text-[10px] border transition-all flex items-center gap-1 ${modeFilter === "sea" ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary" /> SEA
            </button>
            <button
              onClick={() => setStatusFilter(statusFilter === "Atraso" ? null : "Atraso")}
              className={`px-2 py-1 rounded-full text-[10px] border transition-all flex items-center gap-1 ${statusFilter === "Atraso" ? "border-primary bg-[rgba(30,30,30,0.98)] text-amber-200" : "border-white/10 bg-[rgba(14,14,14,0.95)]"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Atraso
            </button>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-2 p-3">
            <div className="bg-[#151515] rounded-xl p-2 border border-white/[0.06]">
              <p className="text-[9px] text-muted-foreground uppercase tracking-[0.14em]">Containers</p>
              <p className="text-base font-semibold">{kpis.seaTransit}</p>
              <p className="text-[9px] text-[#7fd0ff]">Em trânsito</p>
            </div>
            <div className="bg-[#151515] rounded-xl p-2 border border-white/[0.06]">
              <p className="text-[9px] text-muted-foreground uppercase tracking-[0.14em]">Voos</p>
              <p className="text-base font-semibold">{kpis.airActive}</p>
              <p className="text-[9px] text-[#7fd0ff]">Ativos</p>
            </div>
            <div className="bg-[#151515] rounded-xl p-2 border border-white/[0.06]">
              <p className="text-[9px] text-muted-foreground uppercase tracking-[0.14em]">Total</p>
              <p className="text-base font-semibold">{kpis.seaTransit + kpis.airActive}</p>
              <p className="text-[9px] text-[#7fd0ff]">SEA + AIR</p>
            </div>
            <div className="bg-[#151515] rounded-xl p-2 border border-white/[0.06]">
              <p className="text-[9px] text-muted-foreground uppercase tracking-[0.14em]">Atrasos</p>
              <p className="text-base font-semibold">{kpis.delayed}</p>
              <p className="text-[9px] text-[#ff8b8b]">Impacto</p>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 text-[10px] text-muted-foreground px-2 py-1 rounded-full bg-black/85 border border-white/10 z-[1000]">
        <span className="w-2 h-2 rounded-full bg-primary" /> SEA
        <span className="w-2 h-2 rounded-full bg-[#7fd0ff]" /> AIR
      </div>

      {/* Asset Details Panel - fullscreen - aligned top right */}
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
          <div className="p-3 space-y-2 text-sm">
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
              <span className={`px-2 py-0.5 rounded-lg text-xs ${selectedAssetDetails.status === 'Atraso' ? 'bg-red-500/20 text-red-400' : selectedAssetDetails.status === 'Entregue' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                {selectedAssetDetails.status}
              </span>
            </div>
          </div>

          {/* Processos */}
          <div className="p-3 border-t border-white/[0.05]">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
              Processos ({selectedAssetDetails.processos.length})
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {selectedAssetDetails.processos.length > 0 ? (
                selectedAssetDetails.processos.map((awb, idx) => (
                  <div key={idx} className="text-xs px-2 py-1.5 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                    {awb}
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic">Nenhum processo</p>
              )}
            </div>
          </div>

          {/* Faturamento */}
          <div className="p-3 border-t border-white/[0.05]">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Faturamento</p>
            <p className="text-xs text-muted-foreground italic">Em desenvolvimento...</p>
          </div>
        </div>
      )}
    </>
  ) : null;

  // Fullscreen mode - map takes entire screen
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
      {/* Background - consistente com PageLayout */}
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
              onClick={() => navigate("/dashboard")}
              className="w-7 h-7 md:w-8 md:h-8 rounded-full border border-[rgba(255,255,255,.12)] bg-[rgba(5,6,18,0.9)] text-[#aaaaaa] flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
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
            <div
              className="w-7 h-7 md:w-9 md:h-9 rounded-full border border-border/50 flex items-center justify-center bg-background/70 text-primary"
              title="Movimentação Global"
            >
              <Globe size={14} />
            </div>
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

              {/* Asset Details Panel - floating on map with scroll */}
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
            <div className="p-4 border-b border-white/[0.08]">
              <h2 className="text-sm tracking-[0.16em] uppercase text-white/90">Resumo de Movimentações</h2>
              <p className="text-xs text-muted-foreground">Principais embarques por origem, destino, modal e status</p>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.02]">
                  <tr>
                    <th className="p-2 px-3 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground border-b border-white/[0.06] sticky top-0 bg-[rgba(5,6,8,0.98)]">
                      Cliente
                    </th>
                    <th className="p-2 px-3 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground border-b border-white/[0.06] sticky top-0 bg-[rgba(5,6,8,0.98)]">
                      Modal
                    </th>
                    <th className="p-2 px-3 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground border-b border-white/[0.06] sticky top-0 bg-[rgba(5,6,8,0.98)]">
                      Origem → Destino
                    </th>
                    <th className="p-2 px-3 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground border-b border-white/[0.06] sticky top-0 bg-[rgba(5,6,8,0.98)]">
                      ETA
                    </th>
                    <th className="p-2 px-3 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground border-b border-white/[0.06] sticky top-0 bg-[rgba(5,6,8,0.98)]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((row, i) => (
                    <tr key={row.key} className={`border-b border-white/[0.04] ${i % 2 === 0 ? "" : "bg-white/[0.01]"} hover:bg-white/[0.03] transition-colors`}>
                      <td className="p-2 px-3">{row.cliente}</td>
                      <td className="p-2 px-3">
                        <Badge variant="outline" className={`text-[10px] ${row.mode === "air" ? "border-[#7fd0ff]/60 text-[#b7e2ff]" : "border-primary/60 text-primary"}`}>
                          {row.mode === "air" ? "AIR" : "SEA"}
                        </Badge>
                      </td>
                      <td className="p-2 px-3">{row.rota}</td>
                      <td className="p-2 px-3 text-muted-foreground">{row.eta_api}</td>
                      <td className="p-2 px-3">
                        <Badge
                          variant="outline"
                          className={
                            row.status === "Atraso"
                              ? "border-red-500/60 text-red-400"
                              : row.status === "Entregue"
                              ? "border-green-500/60 text-green-400"
                              : "border-blue-500/60 text-blue-400"
                          }
                        >
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 p-2 border-t border-white/[0.05]">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-[10px] rounded border border-white/10 bg-black/50 disabled:opacity-50"
                >
                  ←
                </button>
                <span className="px-2 text-xs text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 text-[10px] rounded border border-white/10 bg-black/50 disabled:opacity-50"
                >
                  →
                </button>
              </div>
            )}
          </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground tracking-[0.18em] uppercase">
          Z3US.AI · for logistics
        </div>
      </div>
    </div>
  );
}
