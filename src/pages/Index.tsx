import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Mail,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
  Loader2,
  ArrowUpDown,
  AlertTriangle,
  X,
  ExternalLink,
  Database,
  LogOut,
  Edit2,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Type assertion for external tables not in Supabase types
const db = supabase as any;
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

interface DhlAwbTracking {
  id: number;
  awb: string;
  hawb: string | null;
  consignee_name: string | null;
  route: string | null;
  status: string | null;
  last_event: string | null;
  last_update: string | null;
  last_checked: string | null;
  analyst: string | null;
  notes: string | null;
  customer_email: string | null;
  terminal: string | null;
  consignee_email?: string | null;
  consignee: string | null;
  whatsapp_alert?: boolean;
  email_alert?: boolean;
  delivered_at?: string | null;
  estimated_delivery?: string | null;
  days_in_transit?: number | null;
  nfd_counter?: number | null;
  bug_alert?: boolean;
}

interface DashboardStats {
  total_awbs: number;
  active_awbs: number;
  alert_awbs: number;
  critical_awbs: number;
}

type AlertCategory = "on_time" | "delayed" | "critical";

interface LogData {
  id: number;
  created_at: string;
  mimicked_operator_id: string | null;
  actor_name: string | null;
  action: string | null;
  new_value: any;
  awb: string | null;
}

interface EmailHistory {
  id: number;
  created_at: string;
  created_by: string;
  subject: string;
  content: string;
  awb: string | null;
  consignee_email: string | null;
  status: string;
}

interface ColumnVisibility {
  awb: boolean;
  hawb: boolean;
  consignee: boolean;
  route: boolean;
  status: boolean;
  last_event: boolean;
  last_update: boolean;
  last_checked: boolean;
  analyst: boolean;
  terminal: boolean;
  whatsapp_alert: boolean;
  email_alert: boolean;
  delivered_at: boolean;
  estimated_delivery: boolean;
  days_in_transit: boolean;
  nfd_counter: boolean;
}

const COLUMN_LABELS: Record<keyof ColumnVisibility, string> = {
  awb: "AWB",
  hawb: "HAWB",
  consignee: "Cliente",
  route: "Rota",
  status: "Rastreio",
  last_event: "Último Evento",
  last_update: "Última Atualização",
  last_checked: "Última Verificação",
  analyst: "Nome Analista",
  terminal: "Terminal",
  whatsapp_alert: "WhatsApp Ativo",
  email_alert: "Email Ativo",
  delivered_at: "Data Entrega",
  estimated_delivery: "Previsão Entrega",
  days_in_transit: "Dias em Trânsito",
  nfd_counter: "Qtd NFD",
};

const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  awb: true,
  hawb: true,
  consignee: true,
  route: true,
  status: true,
  last_event: true,
  last_update: true,
  last_checked: true,
  analyst: true,
  terminal: true,
  whatsapp_alert: true,
  email_alert: true,
  delivered_at: true,
  estimated_delivery: true,
  days_in_transit: true,
  nfd_counter: true,
};

const ALERT_FILTERS = [
  { value: "all", label: "Todas as AWBs" },
  { value: "on_time", label: "No Prazo" },
  { value: "delayed", label: "Em Alerta" },
  { value: "critical", label: "Críticos" },
];

const ITEMS_PER_PAGE = 10;

const airlineTrackingLinks: Record<string, string> = {
  "074": "https://www.latamcargo.com/pt/cargo-status/tracking?awbPrefix=045&awbSuffix=${awb}",
  "145": "https://www.latamcargo.com/pt/cargo-status/tracking?awbPrefix=045&awbSuffix=${awb}",
  "045": "https://www.latamcargo.com/pt/cargo-status/tracking?awbPrefix=045&awbSuffix=${awb}",
  "176": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "020": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "695": "https://ecom.klmcargo.com/ecobff/routingInfo?airWaybillPrefix=074&airWaybillSuffix=${awb}&source=trackingSearch",
  "057": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "083": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "157": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "618": "https://www.qrcargo.com/tracking?AWB=618-${awb}",
  "125": "https://www.britishairways.com/travel/cargo-tracking/public/en_us?awb=125-${awb}",
  "160": "https://www.klmcargo.com/en/tracking/${awb}",
  "141": "https://www.klmcargo.com/en/tracking/${awb}",
  "180": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "186": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "205": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "214": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "232": "https://www.klmcargo.com/en/tracking/${awb}",
  "234": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "239": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "247": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "255": "https://www.klmcargo.com/en/tracking/${awb}",
  "257": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "264": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "275": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "279": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "298": "https://www.klmcargo.com/en/tracking/${awb}",
  "301": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "305": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "314": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "329": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "357": "https://www.klmcargo.com/en/tracking/${awb}",
  "369": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "390": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "403": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "405": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "423": "https://www.klmcargo.com/en/tracking/${awb}",
  "457": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "465": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "476": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "479": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "495": "https://www.klmcargo.com/en/tracking/${awb}",
  "509": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "555": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "566": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "572": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "574": "https://www.klmcargo.com/en/tracking/${awb}",
  "581": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "583": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "601": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "603": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "615": "https://www.klmcargo.com/en/tracking/${awb}",
  "623": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "625": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "631": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "636": "https://www.klmcargo.com/en/tracking/${awb}",
  "642": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "646": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "647": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "649": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "653": "https://www.klmcargo.com/en/tracking/${awb}",
  "655": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "657": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "665": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "670": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "675": "https://www.klmcargo.com/en/tracking/${awb}",
  "677": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "680": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "686": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "689": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "700": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "705": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "710": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "715": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "720": "https://www.klmcargo.com/en/tracking/${awb}",
  "725": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "730": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "735": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "740": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "745": "https://www.klmcargo.com/en/tracking/${awb}",
  "750": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "755": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "760": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "765": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "770": "https://www.klmcargo.com/en/tracking/${awb}",
  "775": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "780": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "785": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "790": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "795": "https://www.klmcargo.com/en/tracking/${awb}",
  "800": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "805": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "810": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "815": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "820": "https://www.klmcargo.com/en/tracking/${awb}",
  "825": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "830": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "835": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "840": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "845": "https://www.klmcargo.com/en/tracking/${awb}",
  "850": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "855": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "860": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "865": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "870": "https://www.klmcargo.com/en/tracking/${awb}",
  "875": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "880": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "885": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "890": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "895": "https://www.klmcargo.com/en/tracking/${awb}",
  "900": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "905": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "910": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "915": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "920": "https://www.klmcargo.com/en/tracking/${awb}",
  "925": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "930": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "935": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "940": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "945": "https://www.klmcargo.com/en/tracking/${awb}",
  "950": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "955": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "960": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "965": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "970": "https://www.klmcargo.com/en/tracking/${awb}",
  "975": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "980": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "985": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "990": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "995": "https://www.klmcargo.com/en/tracking/${awb}",
  "999": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "001": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "002": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "003": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "004": "https://www.klmcargo.com/en/tracking/${awb}",
  "005": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "006": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "007": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "008": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "009": "https://www.klmcargo.com/en/tracking/${awb}",
  "010": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "011": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "012": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "013": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "014": "https://www.klmcargo.com/en/tracking/${awb}",
  "015": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "016": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "017": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "018": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "019": "https://www.klmcargo.com/en/tracking/${awb}",
  "021": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "022": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "023": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "024": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "025": "https://www.klmcargo.com/en/tracking/${awb}",
  "026": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "027": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "028": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "029": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "030": "https://www.klmcargo.com/en/tracking/${awb}",
  "031": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "032": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "033": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "034": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "035": "https://www.klmcargo.com/en/tracking/${awb}",
  "036": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "037": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "038": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "039": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "040": "https://www.klmcargo.com/en/tracking/${awb}",
  "041": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "042": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "043": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "044": "https://www.cma-cgm.com/ebusiness/tracking/awb/${awb}",
  "047": "https://parcelsapp.com/en/tracking/${formattedAwb}",
  "055": "https://pg.fr8manage.app/cargospot/fetchTrackingData?airlinePrefix=${pr}",
};

const getAirlinePrefix = (awbNumber: string): string => {
  if (!awbNumber || awbNumber.length < 3) return "";
  const numericPart = awbNumber.replace(/\D/g, "");
  return numericPart.slice(0, 3);
};

const getFormattedTrackingLink = (awbNumber: string): string | null => {
  const prefix = getAirlinePrefix(awbNumber);
  const numericPart = awbNumber.replace(/\D/g, "");
  const awb = numericPart.slice(-8);

  if (!prefix || !awb) return null;

  const baseUrl = airlineTrackingLinks[prefix];
  if (!baseUrl) return null;

  return baseUrl
    .replace("${pr}", prefix)
    .replace("${awb}", awb)
    .replace("${formattedAwb}", `${prefix}-${awb}`);
};

const getBugAlertColor = (awb: DhlAwbTracking | null, isSelected: boolean): string => {
  if (!awb) {
    return isSelected ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-200";
  }

  const { status, days_in_transit, nfd_counter } = awb;

  if (awb.bug_alert) {
    return isSelected ? "bg-red-700 text-white" : "bg-red-800 text-red-100";
  }

  if (status === "ENTREGUE" || status === "DELIVERED") {
    return isSelected ? "bg-green-700 text-white" : "bg-green-800 text-green-100";
  }

  if (status === "ALERTA" || status === "DELAYED") {
    if (days_in_transit !== null && days_in_transit !== undefined && days_in_transit > 10) {
      return isSelected ? "bg-red-700 text-white" : "bg-red-800 text-red-100";
    }

    if (nfd_counter !== null && nfd_counter !== undefined && nfd_counter > 2) {
      return isSelected ? "bg-orange-700 text-white" : "bg-orange-800 text-orange-100";
    }

    return isSelected ? "bg-yellow-700 text-black" : "bg-yellow-500 text-black";
  }

  if (days_in_transit !== null && days_in_transit !== undefined && days_in_transit > 15) {
    return isSelected ? "bg-red-700 text-white" : "bg-red-800 text-red-100";
  }

  return isSelected ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-200";
};

const getBugAlertDescription = (awb: DhlAwbTracking | null): string => {
  if (!awb) return "Nenhuma AWB selecionada";

  const issues = [];

  if (awb.bug_alert) {
    issues.push("Essa carga possui BUG ALERT no sistema.");
  }

  if (awb.days_in_transit !== null && awb.days_in_transit !== undefined && awb.days_in_transit > 15) {
    issues.push(
      `A carga está há ${awb.days_in_transit} dias em trânsito, o que é considerado muito acima do normal.`
    );
  }

  if (awb.nfd_counter !== null && awb.nfd_counter !== undefined && awb.nfd_counter > 2) {
    issues.push(
      `Já foram registrados ${awb.nfd_counter} eventos de NFD para essa carga, indicando possíveis problemas recorrentes.`
    );
  }

  if (awb.status === "ALERTA" || awb.status === "DELAYED") {
    issues.push("Essa AWB está atualmente em status de ALERTA no rastreio.");
  }

  if (issues.length === 0) {
    return "Nenhum alerta crítico identificado para essa AWB.";
  }

  return issues.join(" ");
};

const airCargoSearchLink = (awbNumber: string): string => {
  const prefix = getAirlinePrefix(awbNumber);
  const numericPart = awbNumber.replace(/\D/g, "");
  const awb = numericPart.slice(-8);
  return `https://aircargotrack.com/search/air-tracking/${prefix}-${awb}`;
};

// supabase is imported from "@/integrations/supabase/client"

const Index = () => {
  const [stats, setStats] = useState<DashboardStats>({
    total_awbs: 0,
    active_awbs: 0,
    alert_awbs: 0,
    critical_awbs: 0,
  });

  const [awbs, setAwbs] = useState<DhlAwbTracking[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [analystFilter, setAnalystFilter] = useState<string>("all");
  const [alertFilter, setAlertFilter] = useState<AlertCategory | "all">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [analysts, setAnalysts] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAwb, setSelectedAwb] = useState<DhlAwbTracking | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logData, setLogData] = useState<LogData[]>([]);
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedAwbForEmail, setSelectedAwbForEmail] = useState<string | null>(null);
  const [emailRecipient, setEmailRecipient] = useState<string>("");
  const [emailSubject, setEmailSubject] = useState<string>("");
  const [emailContent, setEmailContent] = useState<string>("");
  const [emailHistory, setEmailHistory] = useState<EmailHistory[]>([]);
  const [isEmailHistoryModalOpen, setIsEmailHistoryModalOpen] = useState(false);
  const [isEmailHistoryLoading, setIsEmailHistoryLoading] = useState(false);
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [sortField, setSortField] = useState<keyof DhlAwbTracking>("awb");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(() => {
    if (typeof window !== "undefined") {
      const savedVisibility = localStorage.getItem("columnVisibility");
      return savedVisibility ? JSON.parse(savedVisibility) : DEFAULT_COLUMN_VISIBILITY;
    }
    return DEFAULT_COLUMN_VISIBILITY;
  });

  const [filterModalAwb, setFilterModalAwb] = useState("");
  const filterModalRef = useRef<HTMLDivElement | null>(null);
  const [bugAlertExplication, setBugAlertExplication] = useState<string | null>(null);
  const [emailFilter, setEmailFilter] = useState<"all" | "email_enabled" | "email_disabled">("all");
  const [consoleLog, setConsoleLog] = useState<string[]>([]);
  const [isUpdatingAwb, setIsUpdatingAwb] = useState<string | null>(null);

  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [currentRemarkAwb, setCurrentRemarkAwb] = useState<string | null>(null);
  const [currentRemarkText, setCurrentRemarkText] = useState<string>("");

  const { toast } = useToast();

  const logToConsole = (message: string) => {
    setConsoleLog((prev) => [message, ...prev].slice(0, 50));
    console.log(message);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterModalRef.current &&
        !filterModalRef.current.contains(event.target as Node)
      ) {
        setFilterModalAwb("");
      }
    };

    if (filterModalAwb) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [filterModalAwb]);

  const explanationAreaClasses = useMemo(() => {
    const hasExplanation = bugAlertExplication && bugAlertExplication.length > 0;
    return `mt-4 rounded-lg border ${
      hasExplanation ? "border-yellow-500 bg-yellow-950/40" : "border-slate-700 bg-slate-900/60"
    } p-4 text-sm text-slate-100 shadow-inner`;
  }, [bugAlertExplication]);

  const fetchDashboardData = async () => {
    try {
      const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_dhl_awb_tracking" },
      });

      if (error || !response?.success) {
        console.error("Error fetching dashboard data:", error || response?.error);
        toast({
          title: "Erro ao carregar dados",
          description: "Não foi possível carregar os dados do dashboard.",
          variant: "destructive",
        });
        return;
      }

      const data = response.data || [];

      const total_awbs = data.length;
      const active_awbs = data.filter(
        (awb: DhlAwbTracking) =>
          awb.status === "EM ANDAMENTO" ||
          (awb.days_in_transit !== null && awb.days_in_transit > 0)
      ).length;
      const alert_awbs = data.filter(
        (awb: DhlAwbTracking) =>
          awb.status === "ALERTA" ||
          (awb.days_in_transit !== null && awb.days_in_transit > 10)
      ).length;
      const critical_awbs = data.filter(
        (awb: DhlAwbTracking) =>
          awb.bug_alert ||
          (awb.days_in_transit !== null && awb.days_in_transit > 15) ||
          (awb.nfd_counter !== null && awb.nfd_counter > 2)
      ).length;

      setStats({
        total_awbs,
        active_awbs,
        alert_awbs,
        critical_awbs,
      });

      setAwbs(data);
      const analystNames: string[] = Array.from(
        new Set(
          (data as DhlAwbTracking[])
            .map((awb) => awb.analyst)
            .filter((analyst): analyst is string => analyst !== null)
        )
      );
      setAnalysts(analystNames);
    } catch (err) {
      console.error("Error in fetchDashboardData:", err);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar os dados do dashboard.",
        variant: "destructive",
      });
    }
  };

  const refreshDashboard = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(
        "https://udlog.z3us.ai/auto-trigger-dhl-tracking",
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to trigger DHL tracking update");
      }

      toast({
        title: "Atualização em andamento",
        description: "A atualização do rastreio foi iniciada.",
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));

      await fetchDashboardData();
    } catch (error: any) {
      console.error("Error refreshing dashboard:", error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados do rastreio.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("columnVisibility", JSON.stringify(columnVisibility));
    }
  }, [columnVisibility]);

  const filteredAwbs = awbs.filter((awb) => {
    const matchesSearch =
      awb.awb?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      awb.consignee?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      awb.customer_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      awb.consignee_email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAnalyst =
      analystFilter === "all" || awb.analyst === analystFilter;

    const matchesAlert =
      alertFilter === "all" ||
      (alertFilter === "on_time" &&
        !awb.bug_alert &&
        (awb.days_in_transit ?? 0) <= 10 &&
        (awb.nfd_counter ?? 0) <= 2 &&
        awb.status !== "ALERTA" &&
        awb.status !== "DELAYED") ||
      (alertFilter === "delayed" &&
        !awb.bug_alert &&
        ((awb.days_in_transit ?? 0) > 10 ||
          (awb.nfd_counter ?? 0) > 2 ||
          awb.status === "ALERTA" ||
          awb.status === "DELAYED")) ||
      (alertFilter === "critical" &&
        (awb.bug_alert ||
          (awb.days_in_transit ?? 0) > 15 ||
          (awb.nfd_counter ?? 0) > 2));

    const matchesEmailFilter =
      emailFilter === "all" ||
      (emailFilter === "email_enabled" && awb.email_alert) ||
      (emailFilter === "email_disabled" && !awb.email_alert);

    return matchesSearch && matchesAnalyst && matchesAlert && matchesEmailFilter;
  });

  const sortedAwbs = [...filteredAwbs].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedAwbs.length / ITEMS_PER_PAGE);
  const paginatedAwbs = sortedAwbs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handlePageChange = (direction: "prev" | "next") => {
    if (direction === "prev" && currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    } else if (direction === "next" && currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handleAwbClick = (awb: DhlAwbTracking) => {
    setSelectedAwb(awb);
    setBugAlertExplication(getBugAlertDescription(awb));
  };

  const handleSort = (field: keyof DhlAwbTracking) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getStatusTextColor = (status: string | null) => {
    switch (status) {
      case "ENTREGUE":
      case "DELIVERED":
        return "text-green-400";
      case "ALERTA":
      case "DELAYED":
        return "text-amber-400";
      case "CRÍTICO":
      case "CRITICAL":
        return "text-red-400";
      default:
        return "text-slate-200";
    }
  };

  const getStatusBadgeColor = (awb: DhlAwbTracking) => {
    if (awb.bug_alert || (awb.days_in_transit ?? 0) > 15 || (awb.nfd_counter ?? 0) > 2) {
      return "bg-red-900/80 border border-red-500/60 text-red-100";
    }

    if (awb.status === "ALERTA" || awb.status === "DELAYED") {
      return "bg-yellow-900/70 border border-yellow-500/60 text-yellow-100";
    }

    if (awb.status === "ENTREGUE" || awb.status === "DELIVERED") {
      return "bg-green-900/70 border border-green-500/60 text-green-100";
    }

    return "bg-slate-900/70 border border-slate-700/60 text-slate-100";
  };

  const getStatusLabel = (awb: DhlAwbTracking) => {
    if (awb.bug_alert) return "BUG ALERT";
    if ((awb.days_in_transit ?? 0) > 20) return "ACIMA DE 20 DIAS";
    if ((awb.days_in_transit ?? 0) > 15) return "ACIMA DE 15 DIAS";
    if ((awb.days_in_transit ?? 0) > 10) return "ACIMA DE 10 DIAS";
    if ((awb.nfd_counter ?? 0) > 3) return "> 3 NFDs";
    if ((awb.nfd_counter ?? 0) > 1) return "> 1 NFD";

    return awb.status || "EM ANDAMENTO";
  };

  const openLogModal = async (awbNumber: string) => {
    setIsLogLoading(true);
    setIsLogModalOpen(true);
    setSelectedAwb(
      awbs.find(
        (awb) => awb.awb?.replace(/\D/g, "") === awbNumber.replace(/\D/g, "")
      ) || null
    );

    try {
      const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_awb_logs", awbNumber },
      });

      if (error || !response?.success) {
        console.error("Error fetching log data:", error || response?.error);
        toast({
          title: "Erro ao carregar logs",
          description: "Não foi possível carregar os logs para a AWB selecionada.",
          variant: "destructive",
        });
      } else {
        const formattedData: LogData[] =
          (response.logs || []).map((logEntry: any) => ({
            id: logEntry.id,
            created_at: logEntry.created_at,
            mimicked_operator_id: logEntry.mimicked_operator_id,
            actor_name: logEntry.actor_name,
            action: logEntry.action,
            new_value: typeof logEntry.new_value === 'string' ? JSON.parse(logEntry.new_value || "{}") : logEntry.new_value || {},
            awb: logEntry.awb,
          }));

        setLogData(formattedData);
      }
    } catch (err) {
      console.error("Error in openLogModal:", err);
      toast({
        title: "Erro ao carregar logs",
        description: "Não foi possível carregar os logs para a AWB selecionada.",
        variant: "destructive",
      });
    }

    setIsLogLoading(false);
  };

  const openEmailModal = (awb: DhlAwbTracking) => {
    setSelectedAwbForEmail(awb.awb || null);
    setEmailRecipient(
      awb.customer_email ||
        awb.consignee_email ||
        ""
    );
    setEmailSubject(`Atualização de Rastreamento - AWB ${awb.awb || ""}`);
    setEmailContent(
      `Olá ${awb.consignee || "cliente"},\n\n` +
        `Segue atualização do rastreio da sua carga:\n\n` +
        `AWB: ${awb.awb || "N/A"}\n` +
        `Cliente: ${awb.consignee || "N/A"}\n` +
        `Status: ${awb.status || "N/A"}\n` +
        `Último evento: ${awb.last_event || "N/A"}\n` +
        `Última atualização: ${awb.last_update || "N/A"}\n` +
        `Dias em trânsito: ${awb.days_in_transit ?? "N/A"}\n` +
        `Qtd de NFDs: ${awb.nfd_counter ?? "N/A"}\n\n` +
        `Atenciosamente,\nEquipe DACHSER BRASIL`
    );
    setIsEmailModalOpen(true);
  };

  const handleSendEmail = async () => {
    if (!selectedAwbForEmail || !emailRecipient || !emailSubject || !emailContent) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos antes de enviar o email.",
        variant: "destructive",
      });
      return;
    }

    setIsEmailSending(true);

    try {
      logToConsole(`Iniciando envio de e-mail para AWB ${selectedAwbForEmail}`);

      const { data, error } = await db.functions.invoke(
        "email-daclient",
        {
          body: {
            awb: selectedAwbForEmail,
            to: emailRecipient,
            subject: emailSubject,
            content: emailContent,
          },
        }
      );

      if (error) {
        console.error("Erro ao enviar email:", error);
        logToConsole(`Erro ao enviar e-mail: ${error.message}`);
        throw error;
      }

      logToConsole(`Resposta da função de email: ${JSON.stringify(data)}`);

      const message =
        data?.message ||
        `Email enviado com sucesso para ${emailRecipient} - AWB ${selectedAwbForEmail}`;

      toast({
        title: "Email enviado",
        description: message,
      });

      setIsEmailModalOpen(false);
    } catch (error: any) {
      console.error("Erro ao enviar email:", error);
      toast({
        title: "Erro ao enviar email",
        description: error.message || "Verifique os logs para mais detalhes.",
        variant: "destructive",
      });
    } finally {
      setIsEmailSending(false);
    }
  };

  const openEmailHistoryModal = async (awbNumber: string) => {
    setIsEmailHistoryLoading(true);
    setIsEmailHistoryModalOpen(true);

    try {
      const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_email_history", awbNumber },
      });

      if (error || !response?.success) {
        console.error("Erro ao carregar histórico de emails:", error || response?.error);
        toast({
          title: "Erro ao carregar histórico",
          description: "Não foi possível carregar o histórico de emails.",
          variant: "destructive",
        });
      } else {
        setEmailHistory(
          (response.history || []).map((entry: any) => ({
            id: entry.id,
            created_at: entry.created_at,
            created_by: entry.created_by,
            subject: entry.subject,
            content: entry.content,
            awb: entry.awb,
            consignee_email: entry.consignee_email,
            status: entry.status,
          }))
        );
      }
    } catch (err) {
      console.error("Error in openEmailHistoryModal:", err);
      toast({
        title: "Erro ao carregar histórico",
        description: "Não foi possível carregar o histórico de emails.",
        variant: "destructive",
      });
    }

    setIsEmailHistoryLoading(false);
  };

  const handleToggleColumn = (column: keyof ColumnVisibility) => {
    setColumnVisibility((prev) => {
      const newVisibility = {
        ...prev,
        [column]: !prev[column],
      };
      return newVisibility;
    });
  };

  const handleResetColumns = () => {
    setColumnVisibility(DEFAULT_COLUMN_VISIBILITY);
  };

  const handleEmailToggle = async (
    awbNumber: string,
    currentValue: boolean | undefined
  ) => {
    const newValue = !currentValue;

    const confirmed = window.confirm(
      `Tem certeza que deseja ${newValue ? "ATIVAR" : "DESATIVAR"} os envios de email para a AWB ${awbNumber}?`
    );

    if (!confirmed) return;

    try {
      const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "update_dhl_awb_tracking", awbNumber, updates: { email_alert: newValue } },
      });

      if (error || !response?.success) {
        console.error("Error updating email_alert:", error || response?.error);
        toast({
          title: "Erro ao atualizar email_alert",
          description: "Não foi possível atualizar o status de email para esta AWB.",
          variant: "destructive",
        });
        return;
      }

      setAwbs((prev) =>
        prev.map((awb) =>
          awb.awb === awbNumber ? { ...awb, email_alert: newValue } : awb
        )
      );

      toast({
        title: `Email ${newValue ? "ativado" : "desativado"}`,
        description: `Os envios de email foram ${
          newValue ? "ativados" : "desativados"
        } para AWB ${awbNumber}.`,
      });
    } catch (error: any) {
      console.error("Error in handleEmailToggle:", error);
      toast({
        title: "Erro inesperado",
        description: "Ocorreu um erro inesperado ao atualizar o status de email.",
        variant: "destructive",
      });
    }
  };

  const handleWhatsAppToggle = async (
    awbNumber: string,
    currentValue: boolean | undefined
  ) => {
    const newValue = !currentValue;

    const confirmed = window.confirm(
      `Tem certeza que deseja ${newValue ? "ATIVAR" : "DESATIVAR"} os envios de WhatsApp para a AWB ${awbNumber}?`
    );

    if (!confirmed) return;

    try {
      const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "update_dhl_awb_tracking", awbNumber, updates: { whatsapp_alert: newValue } },
      });

      if (error || !response?.success) {
        console.error("Error updating whatsapp_alert:", error || response?.error);
        toast({
          title: "Erro ao atualizar whatsapp_alert",
          description: "Não foi possível atualizar o status de WhatsApp para esta AWB.",
          variant: "destructive",
        });
        return;
      }

      setAwbs((prev) =>
        prev.map((awb) =>
          awb.awb === awbNumber ? { ...awb, whatsapp_alert: newValue } : awb
        )
      );

      toast({
        title: `WhatsApp ${newValue ? "ativado" : "desativado"}`,
        description: `Os envios de WhatsApp foram ${
          newValue ? "ativados" : "desativados"
        } para AWB ${awbNumber}.`,
      });
    } catch (error: any) {
      console.error("Error in handleWhatsAppToggle:", error);
      toast({
        title: "Erro inesperado",
        description: "Ocorreu um erro inesperado ao atualizar o status de WhatsApp.",
        variant: "destructive",
      });
    }
  };

  const handleBulkEmailToggle = async (newValue: boolean) => {
    const confirmed = window.confirm(
      `Tem certeza que deseja ${newValue ? "ATIVAR" : "DESATIVAR"} os envios de email para todas as AWBs filtradas?`
    );

    if (!confirmed) return;

    try {
      const filteredAwbNumbers = filteredAwbs.map((awb) => awb.awb).filter(Boolean) as string[];

      const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "bulk_update_dhl_awb_tracking", awbNumbers: filteredAwbNumbers, updates: { email_alert: newValue } },
      });

      if (error || !response?.success) {
        console.error("Error in bulk email update:", error || response?.error);
        toast({
          title: "Erro ao atualizar em massa",
          description: "Não foi possível atualizar o status de email para as AWBs filtradas.",
          variant: "destructive",
        });
        return;
      }

      setAwbs((prev) =>
        prev.map((awb) =>
          filteredAwbNumbers.includes(awb.awb || "")
            ? { ...awb, email_alert: newValue }
            : awb
        )
      );

      toast({
        title: `Email em massa ${newValue ? "ativado" : "desativado"}`,
        description: `Os envios de email foram ${
          newValue ? "ativados" : "desativados"
        } para todas as AWBs filtradas.`,
      });
    } catch (error: any) {
      console.error("Error in handleBulkEmailToggle:", error);
      toast({
        title: "Erro inesperado",
        description: "Ocorreu um erro inesperado ao atualizar o status de email em massa.",
        variant: "destructive",
      });
    }
  };

  const handleBulkWhatsAppToggle = async (newValue: boolean) => {
    const confirmed = window.confirm(
      `Tem certeza que deseja ${newValue ? "ATIVAR" : "DESATIVAR"} os envios de WhatsApp para todas as AWBs filtradas?`
    );

    if (!confirmed) return;

    try {
      const filteredAwbNumbers = filteredAwbs.map((awb) => awb.awb).filter(Boolean) as string[];

      const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "bulk_update_dhl_awb_tracking", awbNumbers: filteredAwbNumbers, updates: { whatsapp_alert: newValue } },
      });

      if (error || !response?.success) {
        console.error("Error in bulk WhatsApp update:", error || response?.error);
        toast({
          title: "Erro ao atualizar em massa",
          description: "Não foi possível atualizar o status de WhatsApp para as AWBs filtradas.",
          variant: "destructive",
        });
        return;
      }

      setAwbs((prev) =>
        prev.map((awb) =>
          filteredAwbNumbers.includes(awb.awb || "")
            ? { ...awb, whatsapp_alert: newValue }
            : awb
        )
      );

      toast({
        title: `WhatsApp em massa ${newValue ? "ativado" : "desativado"}`,
        description: `Os envios de WhatsApp foram ${
          newValue ? "ativados" : "desativados"
        } para todas as AWBs filtradas.`,
      });
    } catch (error: any) {
      console.error("Error in handleBulkWhatsAppToggle:", error);
      toast({
        title: "Erro inesperado",
        description: "Ocorreu um erro inesperado ao atualizar o status de WhatsApp em massa.",
        variant: "destructive",
      });
    }
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return "-";
    try {
      const date = new Date(value);
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch {
      return value;
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return "-";
    try {
      const date = new Date(value);
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }).format(date);
    } catch {
      return value;
    }
  };

  const getAlertCategory = (awb: DhlAwbTracking): AlertCategory => {
    if (awb.bug_alert || (awb.days_in_transit ?? 0) > 15 || (awb.nfd_counter ?? 0) > 2) {
      return "critical";
    }

    if (
      awb.status === "ALERTA" ||
      awb.status === "DELAYED" ||
      (awb.days_in_transit ?? 0) > 10
    ) {
      return "delayed";
    }

    return "on_time";
  };

  const getAlertIcon = (awb: DhlAwbTracking | null) => {
    if (!awb) return <AlertTriangle className="w-5 h-5 text-slate-400" />;

    switch (getAlertCategory(awb)) {
      case "critical":
        return <AlertTriangle className="w-5 h-5 text-red-400" />;
      case "delayed":
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case "on_time":
      default:
        return <AlertTriangle className="w-5 h-5 text-emerald-400" />;
    }
  };

  const alertSummary = useMemo(() => {
    if (!selectedAwb) return "Selecione uma AWB para ver os detalhes do alerta.";

    const parts = [];

    if (selectedAwb.bug_alert) {
      parts.push("BUG ALERT ativo para essa carga.");
    }

    if ((selectedAwb.days_in_transit ?? 0) > 15) {
      parts.push("Tempo em trânsito considerado crítico (mais de 15 dias).");
    } else if ((selectedAwb.days_in_transit ?? 0) > 10) {
      parts.push("Tempo em trânsito elevado (mais de 10 dias).");
    }

    if ((selectedAwb.nfd_counter ?? 0) > 2) {
      parts.push("Ocorrência de NFD acima do esperado.");
    }

    if (
      selectedAwb.status === "ALERTA" ||
      selectedAwb.status === "DELAYED"
    ) {
      parts.push("Status atual do rastreio indica alerta.");
    }

    if (parts.length === 0) {
      return "Nenhuma condição crítica identificada para esta AWB.";
    }

    return parts.join(" ");
  }, [selectedAwb]);

  useEffect(() => {
    if (selectedAwb) {
      setBugAlertExplication(getBugAlertDescription(selectedAwb));
    } else {
      setBugAlertExplication(null);
    }
  }, [selectedAwb]);

  const handleRemarkChange = (awbNumber: string, newRemark: string) => {
    logToConsole(
      `handleRemarkChange chamado para AWB ${awbNumber} com observação: ${newRemark}`
    );
  const updatedAwbs = awbs.map((awb) =>
      awb.awb === awbNumber ? { ...awb, notes: newRemark } : awb
    );
    setAwbs(updatedAwbs);
  };

  const openRemarkModal = (awb: DhlAwbTracking) => {
    setCurrentRemarkAwb(awb.awb || null);
    setCurrentRemarkText(awb.notes || "");
    setRemarkModalOpen(true);
  };

  const handleRemarkBlur = async (awbNumber: string, newRemark: string) => {
    const trimmedRemark = newRemark.trim();

    if (!trimmedRemark) {
      setRemarkModalOpen(false);
      return;
    }

    if (!selectedAwb) {
      toast({
        title: "Nenhuma AWB selecionada",
        description: "Selecione uma AWB antes de salvar uma observação.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUpdatingAwb(awbNumber);
      const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "update_dhl_awb_tracking", awbNumber, updates: { notes: trimmedRemark } },
      });

      if (error || !response?.success) {
        throw new Error(error?.message || response?.error || "Erro ao salvar");
      }

      handleRemarkChange(awbNumber, trimmedRemark);
      setRemarkModalOpen(false);

      toast({
        title: "Observação salva",
        description: "Sua observação foi salva com sucesso.",
      });
    } catch (error: any) {
      console.error("Erro ao salvar observação:", error);
      toast({
        title: "Erro ao salvar observação",
        description: error.message || "Não foi possível salvar a observação. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingAwb(null);
    }
  };

  const handleAttentionList = async (awbNumber: string, action: "add" | "remove") => {
    try {
      setIsUpdatingAwb(awbNumber);

      if (action === "add") {
        const { data: checkResponse } = await supabase.functions.invoke("mariadb-proxy", {
          body: { action: "check_attention_list", awbNumber },
        });

        if (checkResponse?.exists) {
          toast({
            title: "Já na atenção",
            description: `A AWB ${awbNumber} já está na lista de atenção.`,
          });
          setIsUpdatingAwb(null);
          return;
        }

        const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
          body: { action: "add_to_attention_list", awbNumber },
        });

        if (error || !response?.success) {
          throw new Error(error?.message || response?.error || "Erro ao adicionar");
        }

        toast({
          title: "Adicionada à lista de atenção",
          description: `A AWB ${awbNumber} foi adicionada à lista de atenção.`,
        });
      } else {
        const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
          body: { action: "remove_from_attention_list", awbNumber },
        });

        if (error || !response?.success) {
          throw new Error(error?.message || response?.error || "Erro ao remover");
        }

        toast({
          title: "Removida da lista de atenção",
          description: `A AWB ${awbNumber} foi removida da lista de atenção e arquivada.`,
        });
      }
    } catch (error: any) {
      console.error("Erro ao gerenciar lista de atenção:", error);
      toast({
        title: "Erro ao gerenciar lista de atenção",
        description: error.message || "Não foi possível atualizar a lista de atenção. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingAwb(null);
    }
  };

  const handleBugAlertToggle = async (awbNumber: string, currentValue: boolean | undefined) => {
    const newValue = !currentValue;

    const confirmed = window.confirm(
      `Tem certeza que deseja ${newValue ? "ATIVAR" : "DESATIVAR"} o BUG ALERT para a AWB ${awbNumber}?`
    );

    if (!confirmed) return;

    try {
      const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "update_dhl_awb_tracking", awbNumber, updates: { bug_alert: newValue } },
      });

      if (error || !response?.success) {
        console.error("Error updating bug_alert:", error || response?.error);
        toast({
          title: "Erro ao atualizar BUG ALERT",
          description: "Não foi possível atualizar o status de BUG ALERT para esta AWB.",
          variant: "destructive",
        });
        return;
      }

      setAwbs((prev) =>
        prev.map((awb) =>
          awb.awb === awbNumber ? { ...awb, bug_alert: newValue } : awb
        )
      );

      if (selectedAwb && selectedAwb.awb === awbNumber) {
        setSelectedAwb((prev) =>
          prev ? { ...prev, bug_alert: newValue } : prev
        );
      }

      toast({
        title: `BUG ALERT ${newValue ? "ativado" : "desativado"}`,
        description: `O BUG ALERT foi ${
          newValue ? "ativado" : "desativado"
        } para AWB ${awbNumber}.`,
      });
    } catch (error: any) {
      console.error("Error in handleBugAlertToggle:", error);
      toast({
        title: "Erro inesperado",
        description: "Ocorreu um erro inesperado ao atualizar o BUG ALERT.",
        variant: "destructive",
      });
    }
  };

  const handleBulkBugAlertToggle = async (newValue: boolean) => {
    const confirmed = window.confirm(
      `Tem certeza que deseja ${newValue ? "ATIVAR" : "DESATIVAR"} o BUG ALERT para todas as AWBs filtradas?`
    );

    if (!confirmed) return;

    try {
      const filteredAwbNumbers = filteredAwbs.map((awb) => awb.awb).filter(Boolean) as string[];

      const { data: response, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "bulk_update_dhl_awb_tracking", awbNumbers: filteredAwbNumbers, updates: { bug_alert: newValue } },
      });

      if (error || !response?.success) {
        console.error("Error in bulk bug_alert update:", error || response?.error);
        toast({
          title: "Erro ao atualizar BUG ALERT em massa",
          description: "Não foi possível atualizar o BUG ALERT para as AWBs filtradas.",
          variant: "destructive",
        });
        return;
      }

      setAwbs((prev) =>
        prev.map((awb) =>
          filteredAwbNumbers.includes(awb.awb || "")
            ? { ...awb, bug_alert: newValue }
            : awb
        )
      );

      toast({
        title: `BUG ALERT em massa ${newValue ? "ativado" : "desativado"}`,
        description: `O BUG ALERT foi ${
          newValue ? "ativado" : "desativado"
        } para todas as AWBs filtradas.`,
      });
    } catch (error: any) {
      console.error("Error in handleBulkBugAlertToggle:", error);
      toast({
        title: "Erro inesperado",
        description: "Ocorreu um erro inesperado ao atualizar o BUG ALERT em massa.",
        variant: "destructive",
      });
    }
  };

  const handleSendBulkEmailNotification = async () => {
    const filteredAwbNumbers = filteredAwbs
      .filter((awb) => awb.email_alert)
      .map((awb) => awb.awb)
      .filter(Boolean) as string[];

    if (filteredAwbNumbers.length === 0) {
      toast({
        title: "Nenhuma AWB com email ativo",
        description: "Não há AWBs com envio de email ativado nos filtros atuais.",
        variant: "destructive",
      });
      return;
    }

    const confirmed = window.confirm(
      `Você está prestes a enviar notificações de email para ${filteredAwbNumbers.length} AWBs. Deseja continuar?`
    );

    if (!confirmed) return;

    try {
      logToConsole("Iniciando envio em massa de notificações por email...");

      const { data, error } = await supabase.functions.invoke(
        "send-bulk-email-notification",
        {
          body: {
            awbs: filteredAwbNumbers,
          },
        }
      );

      if (error) {
        console.error("Erro ao enviar notificações em massa:", error);
        logToConsole(`Erro ao enviar notificações em massa: ${error.message}`);
        throw error;
      }

      logToConsole(
        `Resposta da função send-bulk-email-notification: ${JSON.stringify(
          data
        )}`
      );

      const message =
        data?.message ||
        `Notificações de email enviadas para ${filteredAwbNumbers.length} AWBs.`;

      toast({
        title: "Notificações enviadas",
        description: message,
      });
    } catch (error: any) {
      console.error("Erro ao enviar notificações em massa:", error);
      toast({
        title: "Erro ao enviar notificações",
        description: error.message || "Verifique os logs para mais detalhes.",
        variant: "destructive",
      });
    }
  };

  const handleSendManualEmailNotification = async (
    awbNumber: string,
    customEmail?: string
  ) => {
    if (!awbNumber) {
      toast({
        title: "AWB inválida",
        description: "Por favor, selecione uma AWB válida para enviar a notificação.",
        variant: "destructive",
      });
      return;
    }

    const selectedAwbData = awbs.find(
      (awb) => awb.awb?.replace(/\D/g, "") === awbNumber.replace(/\D/g, "")
    );

    if (!selectedAwbData) {
      toast({
        title: "AWB não encontrada",
        description: "Não foi possível encontrar os dados da AWB selecionada.",
        variant: "destructive",
      });
      return;
    }

    const recipientEmail =
      customEmail ||
      selectedAwbData.customer_email ||
      selectedAwbData.consignee_email;

    if (!recipientEmail) {
      toast({
        title: "Email não configurado",
        description: "Não há email configurado para essa AWB ou cliente.",
        variant: "destructive",
      });
      return;
    }

    try {
      logToConsole(`Iniciando envio de notificação manual para AWB ${awbNumber}`);

      const { data, error } = await supabase.functions.invoke(
        "send-manual-email-notification",
        {
          body: {
            awb: awbNumber,
            to: recipientEmail,
          },
        }
      );

      if (error) {
        console.error("Erro ao enviar notificação manual:", error);
        logToConsole(`Erro ao enviar notificação manual: ${error.message}`);
        throw error;
      }

      logToConsole(
        `Resposta da função send-manual-email-notification: ${JSON.stringify(
          data
        )}`
      );

      const message =
        data?.message ||
        `Notificação enviada para AWB ${awbNumber} (email: ${recipientEmail})`;

      toast({
        title: "Notificação enviada",
        description: message,
      });
    } catch (error: any) {
      console.error("Erro ao enviar notificação manual:", error);
      toast({
        title: "Erro ao enviar notificação",
        description: error.message || "Verifique os logs para mais detalhes.",
        variant: "destructive",
      });
    }
  };

  const handleSendManualTrackingNotification = async (
    awbNumber: string,
    customConsignee?: string
  ) => {
    if (!awbNumber) {
      toast({
        title: "AWB inválida",
        description: "Por favor, selecione uma AWB válida para enviar a notificação.",
        variant: "destructive",
      });
      return;
    }

    const selectedAwbData = awbs.find(
      (awb) => awb.awb?.replace(/\D/g, "") === awbNumber.replace(/\D/g, "")
    );

    if (!selectedAwbData) {
      toast({
        title: "AWB não encontrada",
        description: "Não foi possível encontrar os dados da AWB selecionada.",
        variant: "destructive",
      });
      return;
    }

    const consigneeName = customConsignee || selectedAwbData.consignee;

    if (!consigneeName) {
      toast({
        title: "Consignee não informado",
        description: "Não há consignee configurado para essa AWB.",
        variant: "destructive",
      });
      return;
    }

    try {
      logToConsole(`Iniciando envio de notificação manual de rastreio para AWB ${awbNumber}`);

      const { data, error } = await supabase.functions.invoke(
        "send-manual-tracking-notification",
        {
          body: {
            awb: awbNumber,
            consignee: consigneeName,
          },
        }
      );

      if (error) {
        console.error("Erro ao enviar notificação manual de rastreio:", error);
        logToConsole(
          `Erro ao enviar notificação manual de rastreio: ${error.message}`
        );
        throw error;
      }

      logToConsole(
        `Resposta da função send-manual-tracking-notification: ${JSON.stringify(
          data
        )}`
      );

      const message =
        data?.message ||
        `Notificação de rastreio enviada para AWB ${awbNumber} (consignee: ${consigneeName})`;

      toast({
        title: "Notificação de rastreio enviada",
        description: message,
      });
    } catch (error: any) {
      console.error("Erro ao enviar notificação manual de rastreio:", error);
      toast({
        title: "Erro ao enviar notificação de rastreio",
        description: error.message || "Verifique os logs para mais detalhes.",
        variant: "destructive",
      });
    }
  };

  const handleSendManualTrackingNotificationWithCustomerEmail = async (
    awbNumber: string,
    customerEmail: string
  ) => {
    if (!awbNumber || !customerEmail) {
      toast({
        title: "Dados inválidos",
        description: "AWB e email do cliente são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    try {
      logToConsole(
        `Iniciando envio de notificação manual de rastreio para AWB ${awbNumber} com email do cliente ${customerEmail}`
      );

      const { data, error } = await supabase.functions.invoke(
        "send-manual-tracking-notification",
        {
          body: {
            awb: awbNumber,
            customer_email: customerEmail,
          },
        }
      );

      if (error) {
        console.error(
          "Erro ao enviar notificação manual de rastreio com email do cliente:",
          error
        );
        logToConsole(
          `Erro ao enviar notificação manual de rastreio com email do cliente: ${error.message}`
        );
        throw error;
      }

      logToConsole(
        `Resposta da função send-manual-tracking-notification (email cliente): ${JSON.stringify(
          data
        )}`
      );

      const message =
        data?.message ||
        `Notificação de rastreio enviada para AWB ${awbNumber} (incluindo cliente: ${customerEmail})`;

      toast({
        title: "Notificação de rastreio enviada",
        description: message,
      });
    } catch (error: any) {
      console.error(
        "Erro ao enviar notificação manual de rastreio com email do cliente:",
        error
      );
      toast({
        title: "Erro ao enviar notificação de rastreio",
        description: error.message || "Verifique os logs para mais detalhes.",
        variant: "destructive",
      });
    }
  };

  const handleSendManualTrackingNotificationWithCustomerName = async (
    awbNumber: string,
    customerName: string
  ) => {
    if (!awbNumber || !customerName) {
      toast({
        title: "Dados inválidos",
        description: "AWB e nome do cliente são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    try {
      logToConsole(
        `Iniciando envio de notificação manual de rastreio para AWB ${awbNumber} com nome do cliente ${customerName}`
      );

      const { data, error } = await supabase.functions.invoke(
        "send-manual-tracking-notification",
        {
          body: {
            awb: awbNumber,
            customer_name: customerName,
          },
        }
      );

      if (error) {
        console.error(
          "Erro ao enviar notificação manual de rastreio com nome do cliente:",
          error
        );
        logToConsole(
          `Erro ao enviar notificação manual de rastreio com nome do cliente: ${error.message}`
        );
        throw error;
      }

      logToConsole(
        `Resposta da função send-manual-tracking-notification (nome cliente): ${JSON.stringify(
          data
        )}`
      );

      const message =
        data?.message ||
        `Notificação de rastreio enviada para AWB ${awbNumber} (incluindo cliente: ${customerName})`;

      toast({
        title: "Notificação de rastreio enviada",
        description: message,
      });
    } catch (error: any) {
      console.error(
        "Erro ao enviar notificação manual de rastreio com nome do cliente:",
        error
      );
      toast({
        title: "Erro ao enviar notificação de rastreio",
        description: error.message || "Verifique os logs para mais detalhes.",
        variant: "destructive",
      });
    }
  };

  const handleSendManualTrackingNotificationWithCustomerEmailAndName = async (
    awbNumber: string,
    customerEmail: string,
    customerName: string
  ) => {
    if (!awbNumber || !customerEmail || !customerName) {
      toast({
        title: "Dados inválidos",
        description: "AWB, email e nome do cliente são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    try {
      logToConsole(
        `Iniciando envio de notificação manual de rastreio para AWB ${awbNumber} com email e nome do cliente ${customerEmail} / ${customerName}`
      );

      const { data, error } = await supabase.functions.invoke(
        "send-manual-tracking-notification",
        {
          body: {
            awb: awbNumber,
            customer_email: customerEmail,
            customer_name: customerName,
          },
        }
      );

      if (error) {
        console.error(
          "Erro ao enviar notificação manual de rastreio com email e nome do cliente:",
          error
        );
        logToConsole(
          `Erro ao enviar notificação manual de rastreio com email e nome do cliente: ${error.message}`
        );
        throw error;
      }

      logToConsole(
        `Resposta da função send-manual-tracking-notification (email e nome cliente): ${JSON.stringify(
          data
        )}`
      );

      const message =
        data?.message ||
        `Notificação de rastreio enviada para AWB ${awbNumber} (incluindo cliente: ${customerEmail} / ${customerName})`;

      toast({
        title: "Notificação de rastreio enviada",
        description: message,
      });
    } catch (error: any) {
      console.error(
        "Erro ao enviar notificação manual de rastreio com email e nome do cliente:",
        error
      );
      toast({
        title: "Erro ao enviar notificação de rastreio",
        description: error.message || "Verifique os logs para mais detalhes.",
        variant: "destructive",
      });
    }
  };

  const handleSendManualTrackingNotificationWithAllOptions = async (
    awbNumber: string,
    customerEmail?: string,
    customerName?: string,
    consigneeName?: string
  ) => {
    if (!awbNumber) {
      toast({
        title: "AWB inválida",
        description: "AWB é obrigatório.",
        variant: "destructive",
      });
      return;
    }

    if (!customerEmail && !customerName && !consigneeName) {
      toast({
        title: "Dados insuficientes",
        description:
          "Informe pelo menos um dado: email do cliente, nome do cliente ou consignee.",
        variant: "destructive",
      });
      return;
    }

    try {
      logToConsole(
        `Iniciando envio de notificação manual de rastreio (all options) para AWB ${awbNumber}`
      );

      const payload: any = { awb: awbNumber };
      if (customerEmail) payload.customer_email = customerEmail;
      if (customerName) payload.customer_name = customerName;
      if (consigneeName) payload.consignee = consigneeName;

      const { data, error } = await supabase.functions.invoke(
        "send-manual-tracking-notification",
        {
          body: payload,
        }
      );

      if (error) {
        console.error(
          "Erro ao enviar notificação manual de rastreio (all options):",
          error
        );
        logToConsole(
          `Erro ao enviar notificação manual de rastreio (all options): ${error.message}`
        );
        throw error;
      }

      logToConsole(
        `Resposta da função send-manual-tracking-notification (all options): ${JSON.stringify(
          data
        )}`
      );

      const message =
        data?.message ||
        `Notificação de rastreio enviada para AWB ${awbNumber} (dados usados: ${
          customerEmail ? `email: ${customerEmail}; ` : ""
        }${customerName ? `nome: ${customerName}; ` : ""}${
          consigneeName ? `consignee: ${consigneeName}` : ""
        })`;

      toast({
        title: "Notificação de rastreio enviada",
        description: message,
      });
    } catch (error: any) {
      console.error(
        "Erro ao enviar notificação manual de rastreio (all options):",
        error
      );
      toast({
        title: "Erro ao enviar notificação de rastreio",
        description: error.message || "Verifique os logs para mais detalhes.",
        variant: "destructive",
      });
    }
  };

  const triggerTrackingUpdate = async (awbNumber: string) => {
    if (!awbNumber) {
      toast({
        title: "AWB inválida",
        description: "Por favor, selecione uma AWB válida.",
        variant: "destructive",
      });
      return;
    }

    try {
      logToConsole(`Iniciando atualização de rastreio para AWB ${awbNumber}`);

      const response = await fetch(
        `https://udlog.z3us.ai/manual-trigger-dhl-tracking?awb=${awbNumber}`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        throw new Error("Falha ao iniciar atualização de rastreio");
      }

      const result = await response.json();
      logToConsole(
        `Resposta da atualização de rastreio: ${JSON.stringify(result)}`
      );

      toast({
        title: "Atualização de rastreio iniciada",
        description: `A atualização do rastreio para AWB ${awbNumber} foi iniciada.`,
      });

      await fetchDashboardData();
    } catch (error: any) {
      console.error("Erro ao atualizar rastreio:", error);
      toast({
        title: "Erro ao atualizar rastreio",
        description: error.message || "Verifique os logs para mais detalhes.",
        variant: "destructive",
      });
    }
  };

  const formatAwbForDisplay = (awbNumber: string | null) => {
    if (!awbNumber) return "-";
    const numericPart = awbNumber.replace(/\D/g, "");
    if (numericPart.length < 11) return awbNumber;

    const prefix = numericPart.slice(0, 3);
    const number = numericPart.slice(3);
    return `${prefix}-${number}`;
  };

  return (
    <div className="min-h-screen bg-black text-slate-100">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-slate-100 border border-zinc-700 transition-colors"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Voltar
            </button>
            <div>
              <h1 className="text-2xl font-semibold tracking-widest text-slate-100">
                D A C H S E R
              </h1>
              <p className="text-xs text-zinc-400 tracking-[0.3em]">
                Aéreo – Rastreamento de AWBs
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-zinc-400">@rastreio.aereo</span>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800/80 shadow-lg shadow-black/40">
            <div className="p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-zinc-400">
                  Total Monitorados
                </span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-zinc-800 text-amber-400">
                  <Mail className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="text-3xl font-semibold">
                  {stats.total_awbs}
                </span>
                <span className="text-xs text-zinc-500">
                  AWBs ativos
                </span>
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-sky-900/40 via-sky-900/10 to-zinc-950 border-sky-700/50 shadow-lg shadow-sky-900/40">
            <div className="p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-zinc-300">
                  Em Trânsito
                </span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-sky-900/60 text-sky-300">
                  <Loader2 className="w-4 h-4 animate-spin-slow" />
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="text-3xl font-semibold text-sky-300">
                  {stats.active_awbs}
                </span>
                <span className="text-xs text-zinc-400">
                  DEP, MAN, RCF, ARR
                </span>
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-amber-900/50 via-amber-900/10 to-zinc-950 border-amber-700/60 shadow-lg shadow-amber-900/40">
            <div className="p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-amber-200">
                  Em Alerta
                </span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-900/70 text-amber-300">
                  <AlertTriangle className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="text-3xl font-semibold text-amber-300">
                  {stats.alert_awbs}
                </span>
                <span className="text-xs text-amber-200/80">
                  DIS, OFLD – Atrasos
                </span>
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-red-900/60 via-red-900/20 to-zinc-950 border-red-700/70 shadow-lg shadow-red-900/50">
            <div className="p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-red-100">
                  Críticos
                </span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-900 text-red-200">
                  <AlertTriangle className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="text-3xl font-semibold text-red-200">
                  {stats.critical_awbs}
                </span>
                <span className="text-xs text-red-100/90">
                  NIL, NIF – Ação imediata
                </span>
              </div>
            </div>
          </Card>
        </section>

        <section className="mb-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex items-center flex-1 min-w-[250px] max-w-xl bg-zinc-950 border border-zinc-800/80 rounded-full px-3 py-1.5 shadow-sm shadow-black/40">
              <Search className="w-4 h-4 text-zinc-500 mr-2" />
              <Input
                placeholder="Buscar por AWB, Consignee ou e-mail"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-zinc-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={analystFilter}
                onValueChange={(value) => {
                  setAnalystFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[160px] bg-zinc-950 border-zinc-800/80 text-xs rounded-full px-3">
                  <SelectValue placeholder="Todos Analistas" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  <SelectItem value="all">Todos Analistas</SelectItem>
                  {analysts.map((analyst) => (
                    <SelectItem key={analyst} value={analyst}>
                      {analyst}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={alertFilter}
                onValueChange={(value: AlertCategory | "all") => {
                  setAlertFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[160px] bg-zinc-950 border-zinc-800/80 text-xs rounded-full px-3">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  {ALERT_FILTERS.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={emailFilter}
                onValueChange={(value: "all" | "email_enabled" | "email_disabled") => {
                  setEmailFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[170px] bg-zinc-950 border-zinc-800/80 text-xs rounded-full px-3">
                  <SelectValue placeholder="Todos emails" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  <SelectItem value="all">Todos Emails</SelectItem>
                  <SelectItem value="email_enabled">Email Ativo</SelectItem>
                  <SelectItem value="email_disabled">Email Inativo</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                className="rounded-full bg-zinc-950 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900"
                onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
              >
                <Filter className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                className="rounded-full border-amber-500/80 text-amber-200 bg-amber-950/20 hover:bg-amber-900/40 text-xs"
                onClick={() => handleBulkBugAlertToggle(true)}
              >
                <AlertTriangle className="w-4 h-4 mr-1.5" />
                Ativar BUG ALERT
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-zinc-700 text-zinc-200 bg-zinc-950 hover:bg-zinc-900 text-xs"
                onClick={() => handleBulkBugAlertToggle(false)}
              >
                <X className="w-4 h-4 mr-1.5" />
                Desativar BUG ALERT
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-zinc-700 text-zinc-200 bg-zinc-950 hover:bg-zinc-900 text-xs"
                onClick={refreshDashboard}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                )}
                Atualizar
              </Button>
            </div>
          </div>

          {isColumnSelectorOpen && (
            <div
              ref={filterModalRef}
              className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-4 text-sm shadow-lg shadow-black/40"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
                    Colunas Visíveis
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100"
                  onClick={handleResetColumns}
                >
                  Resetar
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(columnVisibility).map(([key, value]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer select-none hover:bg-zinc-900/80 rounded-lg px-2 py-1"
                  >
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={() =>
                        handleToggleColumn(key as keyof ColumnVisibility)
                      }
                      className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-0 focus:ring-offset-0"
                    />
                    <span>{COLUMN_LABELS[key as keyof ColumnVisibility]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] gap-6">
          <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.72)] backdrop-blur-sm">
            <div className="border-b border-zinc-800/80 px-4 py-3 flex items-center justify-between bg-gradient-to-r from-zinc-950/95 via-zinc-950/70 to-zinc-950/95">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-[0.25em] text-zinc-400 uppercase">
                  Lista de AWBs
                </span>
                <Badge className="bg-zinc-900/80 border border-zinc-700/80 text-[10px] font-normal rounded-full px-2 py-0">
                  {sortedAwbs.length} registros
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <span className="hidden sm:inline">
                  Página {currentPage} de {totalPages || 1}
                </span>
                <div className="flex items-center border border-zinc-800 rounded-full overflow-hidden">
                  <button
                    onClick={() => handlePageChange("prev")}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-xs hover:bg-zinc-900 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <div className="px-3 py-1 text-[10px] border-x border-zinc-800 bg-zinc-950">
                    {currentPage} / {totalPages || 1}
                  </div>
                  <button
                    onClick={() => handlePageChange("next")}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="px-3 py-1 text-xs hover:bg-zinc-900 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-800 text-xs">
                <thead className="bg-zinc-950/70 backdrop-blur-sm">
                  <tr>
                    {columnVisibility.awb && (
                      <th
                        className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold cursor-pointer select-none hover:bg-muted/50"
                        onClick={() => handleSort("awb")}
                      >
                        <div className="flex items-center gap-1">
                          AWB
                          <ArrowUpDown className="w-3 h-3 text-zinc-500" />
                        </div>
                      </th>
                    )}
                    {columnVisibility.hawb && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">
                        HAWB
                      </th>
                    )}
                    {columnVisibility.consignee && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">
                        Cliente
                      </th>
                    )}
                    {columnVisibility.route && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">
                        Rota
                      </th>
                    )}
                    {columnVisibility.status && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">
                        Rastreio
                      </th>
                    )}
                    {columnVisibility.last_event && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">
                        Último Evento
                      </th>
                    )}
                    {columnVisibility.last_update && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">
                        Última Atualização
                      </th>
                    )}
                    {columnVisibility.last_checked && (
                      <th
                        className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold cursor-pointer select-none hover:bg-muted/50"
                        onClick={() => handleSort("last_checked" as keyof DhlAwbTracking)}
                      >
                        <div className="flex items-center gap-1">
                          Última Verificação
                          <ArrowUpDown className="w-3 h-3 text-zinc-500" />
                        </div>
                      </th>
                    )}
                    {columnVisibility.analyst && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">
                        Nome Analista
                      </th>
                    )}
                    {columnVisibility.terminal && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">
                        Terminal
                      </th>
                    )}
                    {columnVisibility.whatsapp_alert && (
                      <th className="px-3 py-3 text-center text-foreground uppercase text-xs font-bold">
                        WhatsApp
                      </th>
                    )}
                    {columnVisibility.email_alert && (
                      <th className="px-3 py-3 text-center text-foreground uppercase text-xs font-bold">
                        E-mail
                      </th>
                    )}
                    {columnVisibility.delivered_at && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">
                        Data Entrega
                      </th>
                    )}
                    {columnVisibility.estimated_delivery && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">
                        Previsão Entrega
                      </th>
                    )}
                    {columnVisibility.days_in_transit && (
                      <th className="px-3 py-3 text-right text-foreground uppercase text-xs font-bold">
                        Dias
                      </th>
                    )}
                    {columnVisibility.nfd_counter && (
                      <th className="px-3 py-3 text-right text-foreground uppercase text-xs font-bold">
                        NFDs
                      </th>
                    )}
                    <th className="px-3 py-3 text-right text-foreground uppercase text-xs font-bold">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {paginatedAwbs.length === 0 && (
                    <tr>
                      <td
                        colSpan={16}
                        className="px-3 py-6 text-center text-xs text-zinc-500"
                      >
                        Nenhuma AWB encontrada com os filtros atuais.
                      </td>
                    </tr>
                  )}

                  {paginatedAwbs.map((awb) => {
                    const isSelected = selectedAwb?.awb === awb.awb;
                    const bugColor = getBugAlertColor(awb, isSelected);

                    return (
                      <tr
                        key={awb.id}
                        className={`text-xs cursor-pointer hover:bg-zinc-900/80 ${
                          isSelected ? "bg-zinc-900/70" : ""
                        }`}
                        onClick={() => handleAwbClick(awb)}
                      >
                        {columnVisibility.awb && (
                          <TableCell className="px-3 py-2 font-mono whitespace-nowrap">
                            <button
                              type="button"
                              className="text-blue-300 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                openLogModal(awb.awb || "");
                              }}
                            >
                              {formatAwbForDisplay(awb.awb || "")}
                            </button>
                          </TableCell>
                        )}

                        {columnVisibility.hawb && (
                          <TableCell className="px-3 py-2 truncate max-w-[160px]">
                            {awb.hawb || "-"}
                          </TableCell>
                        )}

                        {columnVisibility.consignee && (
                          <TableCell className="px-3 py-2 truncate max-w-[220px]">
                            {awb.consignee || "-"}
                          </TableCell>
                        )}

                        {columnVisibility.route && (
                          <TableCell className="px-3 py-2 whitespace-nowrap">
                            {awb.route || "-"}
                          </TableCell>
                        )}

                        {columnVisibility.status && (
                          <TableCell className="px-3 py-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${getStatusBadgeColor(
                                awb
                              )}`}
                            >
                              {getStatusLabel(awb)}
                            </span>
                          </TableCell>
                        )}

                        {columnVisibility.last_event && (
                          <TableCell
                            className={`px-3 py-2 font-mono text-xs ${getStatusTextColor(
                              awb.last_event || null
                            )}`}
                          >
                            {awb.last_event || "-"}
                          </TableCell>
                        )}

                        {columnVisibility.last_update && (
                          <TableCell className="px-3 py-2">
                            {formatDateTime(awb.last_update || null)}
                          </TableCell>
                        )}

                        {columnVisibility.last_checked && (
                          <TableCell className="px-3 py-2">
                            {formatDateTime(awb.last_checked || null)}
                          </TableCell>
                        )}

                        {columnVisibility.analyst && (
                          <TableCell className="px-3 py-2 whitespace-nowrap">
                            {awb.analyst || "-"}
                          </TableCell>
                        )}

                        {columnVisibility.terminal && (
                          <TableCell className="px-3 py-2 whitespace-nowrap">
                            {awb.terminal || "-"}
                          </TableCell>
                        )}

                        {columnVisibility.whatsapp_alert && (
                          <TableCell className="px-3 py-2 text-center">
                            <Checkbox
                              checked={!!awb.whatsapp_alert}
                              onCheckedChange={(checked) =>
                                handleWhatsAppToggle(awb.awb || "", !!checked)
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="border-zinc-600 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-400"
                            />
                          </TableCell>
                        )}

                        {columnVisibility.email_alert && (
                          <TableCell className="px-3 py-2 text-center">
                            <Checkbox
                              checked={!!awb.email_alert}
                              onCheckedChange={(checked) =>
                                handleEmailToggle(awb.awb || "", !!checked)
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-400"
                            />
                          </TableCell>
                        )}

                        {columnVisibility.delivered_at && (
                          <TableCell className="px-3 py-2">
                            {formatDate(awb.delivered_at || null)}
                          </TableCell>
                        )}

                        {columnVisibility.estimated_delivery && (
                          <TableCell className="px-3 py-2">
                            {formatDate(awb.estimated_delivery || null)}
                          </TableCell>
                        )}

                        {columnVisibility.days_in_transit && (
                          <TableCell className="px-3 py-2 text-right tabular-nums">
                            {awb.days_in_transit ?? "-"}
                          </TableCell>
                        )}

                        {columnVisibility.nfd_counter && (
                          <TableCell className="px-3 py-2 text-right tabular-nums">
                            {awb.nfd_counter ?? "-"}
                          </TableCell>
                        )}

                        <TableCell className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                              title="Abrir rastreio externo"
                              onClick={(e) => {
                                e.stopPropagation();
                                const link = getFormattedTrackingLink(
                                  awb.awb || ""
                                );
                                if (link) window.open(link, "_blank");
                              }}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                              title="Ver logs"
                              onClick={(e) => {
                                e.stopPropagation();
                                openLogModal(awb.awb || "");
                              }}
                            >
                              <Database className="w-3 h-3" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                              title="Enviar e-mail"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEmailModal(awb);
                              }}
                            >
                              <Mail className="w-3 h-3" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                              title="Histórico de e-mails"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEmailHistoryModal(awb.awb || "");
                              }}
                            >
                              <LogOut className="w-3 h-3 rotate-180" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-7 w-7 border ${bugColor} hover:opacity-80`}
                              title="BUG ALERT / Lista de atenção"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBugAlertToggle(awb.awb || "", awb.bug_alert);
                              }}
                            >
                              <AlertTriangle className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Painel lateral de detalhes */}
          <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-4 shadow-[0_18px_60px_rgba(0,0,0,0.72)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getAlertIcon(selectedAwb)}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                    Detalhes do Alerta
                  </p>
                  <p className="text-sm font-medium text-zinc-100">
                    {selectedAwb
                      ? formatAwbForDisplay(selectedAwb.awb || "")
                      : "Nenhuma AWB selecionada"}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-zinc-700 text-[11px] text-zinc-200 bg-zinc-950 hover:bg-zinc-900"
                onClick={() => {
                  if (selectedAwb?.awb) {
                    triggerTrackingUpdate(selectedAwb.awb);
                  }
                }}
                disabled={!selectedAwb}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Reprocessar
              </Button>
            </div>

            <div className="text-xs space-y-1 text-zinc-300">
              <p>
                <span className="text-zinc-500">Cliente: </span>
                {selectedAwb?.consignee || "-"}
              </p>
              <p>
                <span className="text-zinc-500">Rota: </span>
                {selectedAwb?.route || "-"}
              </p>
              <p>
                <span className="text-zinc-500">Status: </span>
                <span className={getStatusTextColor(selectedAwb?.status || null)}>
                  {selectedAwb?.status || "-"}
                </span>
              </p>
              <p>
                <span className="text-zinc-500">Último evento: </span>
                {selectedAwb?.last_event || "-"}
              </p>
              <p>
                <span className="text-zinc-500">Dias em trânsito: </span>
                {selectedAwb?.days_in_transit ?? "-"}
              </p>
              <p>
                <span className="text-zinc-500">Qtd NFDs: </span>
                {selectedAwb?.nfd_counter ?? "-"}
              </p>
            </div>

            <div className={explanationAreaClasses}>
              <p className="text-[11px] font-semibold mb-1 text-amber-300 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Resumo do alerta
              </p>
              <p className="text-[11px] leading-relaxed text-zinc-100">
                {alertSummary}
              </p>
              {bugAlertExplication && (
                <p className="text-[10px] text-zinc-300 mt-2">
                  {bugAlertExplication}
                </p>
              )}
            </div>

            <div className="mt-auto space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start rounded-full border-zinc-700 text-[11px] text-zinc-200 bg-zinc-950 hover:bg-zinc-900"
                disabled={!selectedAwb}
                onClick={() => {
                  if (selectedAwb) openRemarkModal(selectedAwb);
                }}
              >
                <Edit2 className="w-3 h-3 mr-2" />
                Adicionar / editar observação
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start rounded-full border-emerald-600/70 text-[11px] text-emerald-200 bg-emerald-950/40 hover:bg-emerald-900/60"
                disabled={!selectedAwb}
                onClick={() => {
                  if (selectedAwb) openEmailModal(selectedAwb);
                }}
              >
                <Mail className="w-3 h-3 mr-2" />
                Enviar atualização por e-mail
              </Button>
            </div>
          </div>
        </section>

        {/* Modal de LOGS */}
        {isLogModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-zinc-400" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">
                      Logs da AWB {selectedAwb?.awb}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Eventos mais recentes primeiro
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-full"
                  onClick={() => setIsLogModalOpen(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              <div className="flex-1 overflow-auto text-xs">
                {isLogLoading ? (
                  <div className="flex items-center justify-center py-6 text-zinc-400">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Carregando logs...
                  </div>
                ) : logData.length === 0 ? (
                  <div className="flex items-center justify-center py-6 text-zinc-400">
                    Nenhum log encontrado para essa AWB.
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-800">
                    {logData.map((log) => (
                      <li key={log.id} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-zinc-400">
                            {new Date(log.created_at).toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {log.actor_name || log.mimicked_operator_id || "Sistema"}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-200 mb-1">
                          {log.action || "Ação registrada"}
                        </p>
                        {log.new_value && (
                          <pre className="mt-1 text-[10px] bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-300 overflow-auto max-h-40">
                            {JSON.stringify(log.new_value, null, 2)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de E-MAIL */}
        {isEmailModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-zinc-400" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">
                      Enviar e-mail – AWB {selectedAwbForEmail}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Ajuste o destinatário e o conteúdo antes de enviar.
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-full"
                  onClick={() => setIsEmailModalOpen(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              <div className="flex-1 overflow-auto px-4 py-3 space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Destinatário</label>
                  <Input
                    value={emailRecipient}
                    onChange={(e) => setEmailRecipient(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-xs"
                    placeholder="email@cliente.com"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Assunto</label>
                  <Input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Conteúdo</label>
                  <textarea
                    value={emailContent}
                    onChange={(e) => setEmailContent(e.target.value)}
                    className="w-full h-40 bg-zinc-950 border border-zinc-800 rounded-lg text-xs p-2 resize-none"
                  />
                </div>
              </div>

              <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-zinc-400 hover:text-zinc-100"
                  onClick={() => setIsEmailModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-7 rounded-full bg-emerald-600 hover:bg-emerald-500 text-[11px]"
                  onClick={handleSendEmail}
                  disabled={isEmailSending}
                >
                  {isEmailSending ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Check className="w-3 h-3 mr-1" />
                      Enviar e-mail
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de histórico de e-mail */}
        {isEmailHistoryModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-zinc-400" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">
                      Histórico de e-mails – AWB {selectedAwbForEmail}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Últimos envios registrados no sistema.
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-full"
                  onClick={() => setIsEmailHistoryModalOpen(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              <div className="flex-1 overflow-auto text-xs">
                {isEmailHistoryLoading ? (
                  <div className="flex items-center justify-center py-6 text-zinc-400">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Carregando histórico...
                  </div>
                ) : emailHistory.length === 0 ? (
                  <div className="flex items-center justify-center py-6 text-zinc-400">
                    Nenhum registro de e-mail para essa AWB.
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-800">
                    {emailHistory.map((email) => (
                      <li key={email.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-zinc-400">
                            {new Date(email.created_at).toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {email.created_by}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-zinc-100 mt-1">
                          {email.subject}
                        </p>
                        <p className="text-[11px] text-zinc-300 mt-1 line-clamp-3 whitespace-pre-wrap">
                          {email.content}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          Destinatário: {email.consignee_email || "-"} — Status:{" "}
                          {email.status}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de observação */}
        {remarkModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-zinc-400" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">
                      Observação – AWB {currentRemarkAwb}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Registro interno para a equipe de análise.
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-full"
                  onClick={() => setRemarkModalOpen(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              <div className="flex-1 overflow-auto px-4 py-3">
                <textarea
                  value={currentRemarkText}
                  onChange={(e) => setCurrentRemarkText(e.target.value)}
                  className="w-full h-40 bg-zinc-950 border border-zinc-800 rounded-lg text-xs p-2 resize-none text-zinc-100"
                  placeholder="Digite aqui a observação para essa AWB..."
                />
              </div>

              <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-zinc-400 hover:text-zinc-100"
                  onClick={() => setRemarkModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-7 rounded-full bg-amber-600 hover:bg-amber-500 text-[11px]"
                  onClick={() => {
                    if (currentRemarkAwb) {
                      handleRemarkBlur(currentRemarkAwb, currentRemarkText);
                    }
                  }}
                  disabled={!!isUpdatingAwb}
                >
                  {isUpdatingAwb ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="w-3 h-3 mr-1" />
                      Salvar observação
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Console técnico (opcional) */}
        {consoleLog.length > 0 && (
          <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[10px] text-zinc-400 max-h-40 overflow-auto">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                <span className="uppercase tracking-[0.25em] text-[9px] text-zinc-500">
                  Console Técnico
                </span>
              </div>
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setConsoleLog([])}
              >
                Limpar
              </button>
            </div>
            <ul className="space-y-1">
              {consoleLog.map((line, index) => (
                <li key={index} className="whitespace-pre-wrap">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
