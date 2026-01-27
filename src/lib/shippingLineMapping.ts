/**
 * Mapeamento centralizado de prefixos MBL (Bill of Lading) para identificação de armadores
 * Este arquivo é a fonte única de verdade para mapeamentos de shipping lines no frontend
 */

import type { ShippingLineCode, ShippingLineInfo } from '@/types/sea';

// Re-export types for convenience
export type { ShippingLineCode, ShippingLineInfo };

// Mapeamento de prefixos MBL para código do armador
export const MBL_PREFIX_MAP: Record<string, ShippingLineCode> = {
  // Hapag-Lloyd
  'HLCU': 'HAPAG_LLOYD',
  'HLXU': 'HAPAG_LLOYD',
  'HLBU': 'HAPAG_LLOYD',
  'HBG': 'HAPAG_LLOYD',
  'SAHL': 'HAPAG_LLOYD',
  'HLC': 'HAPAG_LLOYD',
  
  // MSC - Mediterranean Shipping Company
  'MSCU': 'MSC',
  'MEDU': 'MSC',
  'MSCM': 'MSC',
  'MSDU': 'MSC',
  'MSCB': 'MSC',
  'MSCR': 'MSC',
  
  // Maersk
  'MAEU': 'MAERSK',
  'MRKU': 'MAERSK',
  'MSKU': 'MAERSK',
  'PONU': 'MAERSK',
  'SEAU': 'MAERSK', // Sealand (Maersk subsidiary)
  
  // Hamburg Süd (Maersk subsidiary)
  'SUDU': 'HAMBURG_SUD',
  'HASL': 'HAMBURG_SUD',
  'HSUD': 'HAMBURG_SUD',
  
  // CMA CGM
  'CMAU': 'CMA_CGM',
  'CGMU': 'CMA_CGM',
  'CMDU': 'CMA_CGM',
  'CXDU': 'CMA_CGM',
  'APLU': 'CMA_CGM', // APL (CMA CGM subsidiary)
  'APHU': 'CMA_CGM',
  'ANLU': 'CMA_CGM', // ANL (CMA CGM subsidiary)
  'ANRM': 'CMA_CGM',
  
  // ONE - Ocean Network Express
  'ONEY': 'ONE',
  'ONEU': 'ONE',
  'NYKU': 'ONE', // NYK (ONE founding member)
  'MOLU': 'ONE', // MOL (ONE founding member)
  'KKFU': 'ONE', // K Line (ONE founding member)
  'MOAU': 'ONE',
  'KKLU': 'ONE',
  
  // Evergreen
  'EISU': 'EVERGREEN',
  'EITU': 'EVERGREEN',
  'EGSU': 'EVERGREEN',
  'EGHU': 'EVERGREEN',
  'EMCU': 'EVERGREEN',
  'EGLV': 'EVERGREEN',
  
  // COSCO / OOCL
  'COSU': 'COSCO',
  'CSNU': 'COSCO',
  'CBHU': 'COSCO',
  'OOLU': 'COSCO', // OOCL (COSCO subsidiary)
  'CSLU': 'COSCO',
  'CCLU': 'COSCO',
  
  // Yang Ming
  'YMLU': 'YANG_MING',
  'YMMU': 'YANG_MING',
  'YMPU': 'YANG_MING',
  
  // HMM - Hyundai Merchant Marine
  'HDMU': 'HMM',
  'HMMU': 'HMM',
  'HMCU': 'HMM',
  'KMTU': 'HMM',
  
  // ZIM
  'ZIMU': 'ZIM',
  'ZCSU': 'ZIM',
  
  // PIL - Pacific International Lines
  'PCIU': 'PIL',
  'PILU': 'PIL',
  
  // Wan Hai
  'WHLU': 'WAN_HAI',
  'WANU': 'WAN_HAI',
  'WHLC': 'WAN_HAI',
  
  // Seaboard
  'SMLU': 'SEABOARD',
  
  // Crowley
  'CROU': 'CROWLEY',
  'CLHU': 'CROWLEY',
  
  // Arkas
  'ARKU': 'ARKAS',
  
  // Turkon
  'TRKU': 'TURKON',
  
  // Grimaldi
  'GRIU': 'GRIMALDI',
  
  // SM Line
  'SMLM': 'SM_LINE',
  
  // Transroll
  'TRHU': 'TRANSROLL',
};

// Prefixos de container para código do armador (SCAC codes)
export const CONTAINER_PREFIX_MAP: Record<string, ShippingLineCode> = {
  'HLCU': 'HAPAG_LLOYD',
  'HLXU': 'HAPAG_LLOYD',
  'MSCU': 'MSC',
  'MEDU': 'MSC',
  'MAEU': 'MAERSK',
  'MSKU': 'MAERSK',
  'MRKU': 'MAERSK',
  'CMAU': 'CMA_CGM',
  'CGMU': 'CMA_CGM',
  'APLU': 'CMA_CGM',
  'ONEY': 'ONE',
  'NYKU': 'ONE',
  'EISU': 'EVERGREEN',
  'EGHU': 'EVERGREEN',
  'COSU': 'COSCO',
  'OOLU': 'COSCO',
  'YMLU': 'YANG_MING',
  'HDMU': 'HMM',
  'ZIMU': 'ZIM',
  'PCIU': 'PIL',
  'WHLU': 'WAN_HAI',
  'SUDU': 'HAMBURG_SUD',
};

// Prefixos internos DACHSER (não são armadores - devem ser ignorados)
export const INTERNAL_PREFIXES = ['GLNL', 'GLSL', 'GLDL', 'BRSA', 'SSZ'];

// Informações completas de cada armador
export const SHIPPING_LINE_INFO: Record<ShippingLineCode, ShippingLineInfo> = {
  'HAPAG_LLOYD': {
    code: 'HAPAG_LLOYD',
    name: 'Hapag-Lloyd',
    country: 'Germany',
    color: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    apiSupported: true,
  },
  'MSC': {
    code: 'MSC',
    name: 'MSC - Mediterranean Shipping Company',
    country: 'Switzerland',
    color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    apiSupported: true, // Via JSONCARGO
  },
  'MAERSK': {
    code: 'MAERSK',
    name: 'Maersk',
    country: 'Denmark',
    color: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    apiSupported: true, // Via JSONCARGO
  },
  'HAMBURG_SUD': {
    code: 'HAMBURG_SUD',
    name: 'Hamburg Süd',
    country: 'Germany',
    color: 'bg-red-500/20 text-red-300 border-red-500/30',
    apiSupported: true, // Via Maersk/JSONCARGO
  },
  'CMA_CGM': {
    code: 'CMA_CGM',
    name: 'CMA CGM',
    country: 'France',
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    apiSupported: true, // Via JSONCARGO
  },
  'ONE': {
    code: 'ONE',
    name: 'ONE - Ocean Network Express',
    country: 'Japan',
    color: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    apiSupported: true, // Via JSONCARGO
  },
  'EVERGREEN': {
    code: 'EVERGREEN',
    name: 'Evergreen',
    country: 'Taiwan',
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    apiSupported: true, // Via JSONCARGO
  },
  'COSCO': {
    code: 'COSCO',
    name: 'COSCO Shipping',
    country: 'China',
    color: 'bg-red-600/20 text-red-300 border-red-600/30',
    apiSupported: true, // Via JSONCARGO
  },
  'YANG_MING': {
    code: 'YANG_MING',
    name: 'Yang Ming',
    country: 'Taiwan',
    color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    apiSupported: true, // Via JSONCARGO
  },
  'HMM': {
    code: 'HMM',
    name: 'HMM - Hyundai Merchant Marine',
    country: 'South Korea',
    color: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    apiSupported: true, // Via JSONCARGO
  },
  'ZIM': {
    code: 'ZIM',
    name: 'ZIM Integrated Shipping',
    country: 'Israel',
    color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    apiSupported: true, // Via JSONCARGO
  },
  'PIL': {
    code: 'PIL',
    name: 'PIL - Pacific International Lines',
    country: 'Singapore',
    color: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    apiSupported: true, // Via JSONCARGO
  },
  'WAN_HAI': {
    code: 'WAN_HAI',
    name: 'Wan Hai Lines',
    country: 'Taiwan',
    color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    apiSupported: true, // Via JSONCARGO
  },
  'SEABOARD': {
    code: 'SEABOARD',
    name: 'Seaboard Marine',
    country: 'USA',
    color: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    apiSupported: false,
  },
  'CROWLEY': {
    code: 'CROWLEY',
    name: 'Crowley Maritime',
    country: 'USA',
    color: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    apiSupported: false,
  },
  'ARKAS': {
    code: 'ARKAS',
    name: 'Arkas Line',
    country: 'Turkey',
    color: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
    apiSupported: false,
  },
  'TURKON': {
    code: 'TURKON',
    name: 'Turkon Line',
    country: 'Turkey',
    color: 'bg-lime-500/20 text-lime-300 border-lime-500/30',
    apiSupported: false,
  },
  'GRIMALDI': {
    code: 'GRIMALDI',
    name: 'Grimaldi Lines',
    country: 'Italy',
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    apiSupported: false,
  },
  'SM_LINE': {
    code: 'SM_LINE',
    name: 'SM Line Corporation',
    country: 'South Korea',
    color: 'bg-stone-500/20 text-stone-300 border-stone-500/30',
    apiSupported: false,
  },
  'TRANSROLL': {
    code: 'TRANSROLL',
    name: 'Transroll Navegação',
    country: 'Brazil',
    color: 'bg-green-500/20 text-green-300 border-green-500/30',
    apiSupported: false,
  },
  'UNKNOWN': {
    code: 'UNKNOWN',
    name: 'Armador Desconhecido',
    country: 'Unknown',
    color: 'bg-white/10 text-white/70 border-white/20',
    apiSupported: false,
  },
};

// Nomes legíveis para exibição (atalho)
export const SHIPPING_LINE_NAMES: Record<ShippingLineCode, string> = Object.fromEntries(
  Object.entries(SHIPPING_LINE_INFO).map(([code, info]) => [code, info.name])
) as Record<ShippingLineCode, string>;

/**
 * Detecta o armador a partir do número MBL
 * Tenta prefixos de 4 caracteres primeiro, depois 3
 */
export function detectCarrierFromMbl(mbl: string | null | undefined): ShippingLineInfo {
  if (!mbl) {
    return SHIPPING_LINE_INFO['UNKNOWN'];
  }
  
  const upper = mbl.toUpperCase().trim();
  
  // Verificar se é prefixo interno DACHSER
  for (const prefix of INTERNAL_PREFIXES) {
    if (upper.startsWith(prefix)) {
      return SHIPPING_LINE_INFO['UNKNOWN'];
    }
  }
  
  // Tentar prefixos de 4 caracteres primeiro (mais específico)
  const prefix4 = upper.substring(0, 4);
  if (MBL_PREFIX_MAP[prefix4]) {
    return SHIPPING_LINE_INFO[MBL_PREFIX_MAP[prefix4]];
  }
  
  // Tentar prefixos de 3 caracteres
  const prefix3 = upper.substring(0, 3);
  if (MBL_PREFIX_MAP[prefix3]) {
    return SHIPPING_LINE_INFO[MBL_PREFIX_MAP[prefix3]];
  }
  
  return SHIPPING_LINE_INFO['UNKNOWN'];
}

/**
 * Detecta o armador a partir do número do container
 */
export function detectCarrierFromContainer(containerNumber: string | null | undefined): ShippingLineInfo {
  if (!containerNumber) {
    return SHIPPING_LINE_INFO['UNKNOWN'];
  }
  
  const upper = containerNumber.toUpperCase().trim();
  const prefix4 = upper.substring(0, 4);
  
  if (CONTAINER_PREFIX_MAP[prefix4]) {
    return SHIPPING_LINE_INFO[CONTAINER_PREFIX_MAP[prefix4]];
  }
  
  return SHIPPING_LINE_INFO['UNKNOWN'];
}

/**
 * Verifica se o MBL pertence a um armador conhecido
 */
export function isKnownCarrierMbl(mbl: string | null | undefined): boolean {
  const info = detectCarrierFromMbl(mbl);
  return info.code !== 'UNKNOWN';
}

/**
 * Verifica se é um prefixo interno DACHSER
 */
export function isInternalPrefix(mbl: string | null | undefined): boolean {
  if (!mbl) return false;
  const upper = mbl.toUpperCase().trim();
  return INTERNAL_PREFIXES.some(prefix => upper.startsWith(prefix));
}

/**
 * Retorna lista de armadores com suporte a tracking API
 */
export function getTrackableCarriers(): ShippingLineInfo[] {
  return Object.values(SHIPPING_LINE_INFO).filter(info => info.apiSupported);
}

/**
 * Retorna informações do armador pelo código
 */
export function getShippingLineInfo(code: ShippingLineCode): ShippingLineInfo {
  return SHIPPING_LINE_INFO[code] || SHIPPING_LINE_INFO['UNKNOWN'];
}

/**
 * Retorna o nome legível do armador
 */
export function getShippingLineName(code: ShippingLineCode): string {
  return SHIPPING_LINE_INFO[code]?.name || 'Desconhecido';
}

/**
 * Retorna as classes CSS de cor para o badge do armador
 */
export function getShippingLineColor(code: ShippingLineCode): string {
  return SHIPPING_LINE_INFO[code]?.color || SHIPPING_LINE_INFO['UNKNOWN'].color;
}

/**
 * Normaliza o nome do armador para o código padrão
 * Usado para compatibilidade com valores legados
 */
export function normalizeShippingLineName(input: string | null | undefined): ShippingLineCode {
  if (!input) return 'UNKNOWN';
  
  const upper = input.toUpperCase().trim().replace(/[\s-]+/g, '_');
  
  const aliasMap: Record<string, ShippingLineCode> = {
    'HAPAG': 'HAPAG_LLOYD',
    'HAPAG_LLOYD': 'HAPAG_LLOYD',
    'HAPAG-LLOYD': 'HAPAG_LLOYD',
    'HL': 'HAPAG_LLOYD',
    'MSC': 'MSC',
    'MEDITERRANEAN': 'MSC',
    'MAERSK': 'MAERSK',
    'SEALAND': 'MAERSK',
    'HAMBURG': 'HAMBURG_SUD',
    'HAMBURG_SUD': 'HAMBURG_SUD',
    'HAMBURG_SUED': 'HAMBURG_SUD',
    'CMA': 'CMA_CGM',
    'CMA_CGM': 'CMA_CGM',
    'APL': 'CMA_CGM',
    'ANL': 'CMA_CGM',
    'ONE': 'ONE',
    'OCEAN_NETWORK': 'ONE',
    'NYK': 'ONE',
    'MOL': 'ONE',
    'K_LINE': 'ONE',
    'EVERGREEN': 'EVERGREEN',
    'COSCO': 'COSCO',
    'OOCL': 'COSCO',
    'YANG_MING': 'YANG_MING',
    'YANGMING': 'YANG_MING',
    'HMM': 'HMM',
    'HYUNDAI': 'HMM',
    'ZIM': 'ZIM',
    'PIL': 'PIL',
    'PACIFIC': 'PIL',
    'WAN_HAI': 'WAN_HAI',
    'WANHAI': 'WAN_HAI',
  };
  
  return aliasMap[upper] || 'UNKNOWN';
}

/**
 * Lista todos os códigos de armadores disponíveis
 */
export function getAllShippingLineCodes(): ShippingLineCode[] {
  return Object.keys(SHIPPING_LINE_INFO) as ShippingLineCode[];
}

/**
 * Lista todos os armadores com informações completas
 */
export function getAllShippingLines(): ShippingLineInfo[] {
  return Object.values(SHIPPING_LINE_INFO).filter(info => info.code !== 'UNKNOWN');
}
