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
