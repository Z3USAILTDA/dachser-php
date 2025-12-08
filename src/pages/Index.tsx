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
} from "lucide-react";
import { createClient } from "@/integrations/supabase/client";
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
  "157": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
  "176": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
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
  "618": "https://www.qrcargo.com/tracking?AWB=157-${awb}",
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
  "695": "https://www.klmcargo.com/en/tracking/${awb}",
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

const supabase = createClient();

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
    const { data, error } = await supabase
      .from("dhl_awb_tracking")
      .select("*");

    if (error) {
      console.error("Error fetching dashboard data:", error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar os dados do dashboard.",
        variant: "destructive",
      });
      return;
    }

    const total_awbs = data.length;
    const active_awbs = data.filter(
      (awb) =>
        awb.status === "EM ANDAMENTO" ||
        (awb.days_in_transit !== null && awb.days_in_transit > 0)
    ).length;
    const alert_awbs = data.filter(
      (awb) =>
        awb.status === "ALERTA" ||
        (awb.days_in_transit !== null && awb.days_in_transit > 10)
    ).length;
    const critical_awbs = data.filter(
      (awb) =>
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
    const analystNames = Array.from(
      new Set(
        data
          .map((awb) => awb.analyst)
          .filter((analyst): analyst is string => analyst !== null)
      )
    );
    setAnalysts(analystNames);
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

    const { data, error } = await supabase
      .from("udlog_zeus_console_log_udlog_airfreight")
      .select("*")
      .ilike("awb", `%${awbNumber}%`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching log data:", error);
      toast({
        title: "Erro ao carregar logs",
        description: "Não foi possível carregar os logs para a AWB selecionada.",
        variant: "destructive",
      });
    } else {
      const formattedData: LogData[] =
        data?.map((logEntry: any) => ({
          id: logEntry.id,
          created_at: logEntry.created_at,
          mimicked_operator_id: logEntry.mimicked_operator_id,
          actor_name: logEntry.actor_name,
          action: logEntry.action,
          new_value: JSON.parse(logEntry.new_value || "{}"),
          awb: logEntry.awb,
        })) || [];

      setLogData(formattedData);
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

      const { data, error } = await supabase.functions.invoke(
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

    const { data, error } = await supabase
      .from("udlog_af_email_history")
      .select("*")
      .eq("awb", awbNumber)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar histórico de emails:", error);
      toast({
        title: "Erro ao carregar histórico",
        description: "Não foi possível carregar o histórico de emails.",
        variant: "destructive",
      });
    } else {
      setEmailHistory(
        data?.map((entry: any) => ({
          id: entry.id,
          created_at: entry.created_at,
          created_by: entry.created_by,
          subject: entry.subject,
          content: entry.content,
          awb: entry.awb,
          consignee_email: entry.consignee_email,
          status: entry.status,
        })) || []
      );
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
      const { error } = await supabase
        .from("dhl_awb_tracking")
        .update({ email_alert: newValue })
        .eq("awb", awbNumber);

      if (error) {
        console.error("Error updating email_alert:", error);
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
      const { error } = await supabase
        .from("dhl_awb_tracking")
        .update({ whatsapp_alert: newValue })
        .eq("awb", awbNumber);

      if (error) {
        console.error("Error updating whatsapp_alert:", error);
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

      const { error } = await supabase
        .from("dhl_awb_tracking")
        .update({ email_alert: newValue })
        .in("awb", filteredAwbNumbers);

      if (error) {
        console.error("Error in bulk email update:", error);
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

      const { error } = await supabase
        .from("dhl_awb_tracking")
        .update({ whatsapp_alert: newValue })
        .in("awb", filteredAwbNumbers);

      if (error) {
        console.error("Error in bulk WhatsApp update:", error);
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
      const { error } = await supabase
        .from("dhl_awb_tracking")
        .update({ notes: trimmedRemark })
        .eq("awb", awbNumber);

      if (error) {
        throw error;
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
        description:
          error.message ||
          "Não foi possível salvar a observação. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingAwb(null);
    }
  };

  const handleAttentionList = async (awbNumber: string, action: "add" | "remove") => {
    try {
      setIsUpdatingAwb(awbNumber);

      const tableName =
        action === "add"
          ? "udlog_af_attention_list"
          : "udlog_af_attention_list_archive";

      if (action === "add") {
        const existing = await supabase
          .from("udlog_af_attention_list")
          .select("id")
          .eq("awb", awbNumber)
          .maybeSingle();

        if (existing.data) {
          toast({
            title: "Já na atenção",
            description: `A AWB ${awbNumber} já está na lista de atenção.`,
          });
          setIsUpdatingAwb(null);
          return;
        }
      }

      if (action === "remove") {
        const historyInsert = await supabase
          .from("udlog_af_attention_list_archive")
          .insert({
            awb: awbNumber,
            removed_at: new Date().toISOString(),
          });

        if (historyInsert.error) {
          console.error("Erro ao arquivar atenção:", historyInsert.error);
          throw historyInsert.error;
        }

        const { error } = await supabase
          .from("udlog_af_attention_list")
          .delete()
          .eq("awb", awbNumber);

        if (error) {
          console.error("Erro ao remover da lista de atenção:", error);
          throw error;
        }

        toast({
          title: "Removida da lista de atenção",
          description: `A AWB ${awbNumber} foi removida da lista de atenção e arquivada.`,
        });
      } else {
        const { error } = await supabase.from(tableName).insert({
          awb: awbNumber,
          created_at: new Date().toISOString(),
        });

        if (error) {
          console.error("Erro ao adicionar à lista de atenção:", error);
          throw error;
        }

        toast({
          title: "Adicionada à lista de atenção",
          description: `A AWB ${awbNumber} foi adicionada à lista de atenção.`,
        });
      }
    } catch (error: any) {
      console.error("Erro ao gerenciar lista de atenção:", error);
      toast({
        title: "Erro ao gerenciar lista de atenção",
        description:
          error.message ||
          "Não foi possível atualizar a lista de atenção. Tente novamente.",
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
      const { error } = await supabase
        .from("dhl_awb_tracking")
        .update({ bug_alert: newValue })
        .eq("awb", awbNumber);

      if (error) {
        console.error("Error updating bug_alert:", error);
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

      const { error } = await supabase
        .from("dhl_awb_tracking")
        .update({ bug_alert: newValue })
        .in("awb", filteredAwbNumbers);

      if (error) {
        console.error("Error in bulk bug_alert update:", error);
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
