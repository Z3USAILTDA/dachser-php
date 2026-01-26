/**
 * Mapeamento centralizado de prefixos MBL (Bill of Lading) para identificação de armadores
 * Este arquivo é a fonte única de verdade para mapeamentos de shipping lines nas Edge Functions
 * 
 * NOTA: Este arquivo é uma cópia do src/lib/shippingLineMapping.ts para uso em Edge Functions
 * que não podem importar de src/
 */

export type ShippingLineCode = 
  | 'HAPAG_LLOYD' | 'MSC' | 'MAERSK' | 'HAMBURG_SUD' | 'CMA_CGM' 
  | 'ONE' | 'EVERGREEN' | 'COSCO' | 'YANG_MING' 
  | 'HMM' | 'ZIM' | 'PIL' | 'WAN_HAI' 
  | 'SEABOARD' | 'CROWLEY' | 'ARKAS' | 'TURKON' 
  | 'GRIMALDI' | 'SM_LINE' | 'TRANSROLL' | 'UNKNOWN';

export interface ShippingLineInfo {
  code: ShippingLineCode;
  name: string;
  country: string;
  apiSupported: boolean;
}

// Mapeamento de prefixos MBL para código do armador
export const MBL_PREFIX_MAP: Record<string, ShippingLineCode> = {
  // Hapag-Lloyd
  'HLCU': 'HAPAG_LLOYD',
  'HLXU': 'HAPAG_LLOYD',
  'HLBU': 'HAPAG_LLOYD',
  'HBG': 'HAPAG_LLOYD',
  'SAHL': 'HAPAG_LLOYD',
  'HLC': 'HAPAG_LLOYD',
  
  // MSC
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
  'SEAU': 'MAERSK',
  
  // Hamburg Süd
  'SUDU': 'HAMBURG_SUD',
  'HASL': 'HAMBURG_SUD',
  'HSUD': 'HAMBURG_SUD',
  
  // CMA CGM
  'CMAU': 'CMA_CGM',
  'CGMU': 'CMA_CGM',
  'CMDU': 'CMA_CGM',
  'CXDU': 'CMA_CGM',
  'APLU': 'CMA_CGM',
  'APHU': 'CMA_CGM',
  'ANLU': 'CMA_CGM',
  'ANRM': 'CMA_CGM',
  
  // ONE
  'ONEY': 'ONE',
  'ONEU': 'ONE',
  'NYKU': 'ONE',
  'MOLU': 'ONE',
  'KKFU': 'ONE',
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
  'OOLU': 'COSCO',
  'CSLU': 'COSCO',
  'CCLU': 'COSCO',
  
  // Yang Ming
  'YMLU': 'YANG_MING',
  'YMMU': 'YANG_MING',
  'YMPU': 'YANG_MING',
  
  // HMM
  'HDMU': 'HMM',
  'HMMU': 'HMM',
  'HMCU': 'HMM',
  'KMTU': 'HMM',
  
  // ZIM
  'ZIMU': 'ZIM',
  'ZCSU': 'ZIM',
  
  // PIL
  'PCIU': 'PIL',
  'PILU': 'PIL',
  
  // Wan Hai
  'WHLU': 'WAN_HAI',
  'WANU': 'WAN_HAI',
  'WHLC': 'WAN_HAI',
  
  // Others
  'SMLU': 'SEABOARD',
  'CROU': 'CROWLEY',
  'CLHU': 'CROWLEY',
  'ARKU': 'ARKAS',
  'TRKU': 'TURKON',
  'GRIU': 'GRIMALDI',
  'SMLM': 'SM_LINE',
  'TRHU': 'TRANSROLL',
};

// Prefixos internos DACHSER (não são armadores)
export const INTERNAL_PREFIXES = ['GLNL', 'GLSL', 'GLDL', 'BRSA', 'SSZ'];

// Informações dos armadores
export const SHIPPING_LINE_INFO: Record<ShippingLineCode, ShippingLineInfo> = {
  'HAPAG_LLOYD': { code: 'HAPAG_LLOYD', name: 'Hapag-Lloyd', country: 'Germany', apiSupported: true },
  'MSC': { code: 'MSC', name: 'MSC - Mediterranean Shipping Company', country: 'Switzerland', apiSupported: true },
  'MAERSK': { code: 'MAERSK', name: 'Maersk', country: 'Denmark', apiSupported: true },
  'HAMBURG_SUD': { code: 'HAMBURG_SUD', name: 'Hamburg Süd', country: 'Germany', apiSupported: true },
  'CMA_CGM': { code: 'CMA_CGM', name: 'CMA CGM', country: 'France', apiSupported: true },
  'ONE': { code: 'ONE', name: 'ONE - Ocean Network Express', country: 'Japan', apiSupported: true },
  'EVERGREEN': { code: 'EVERGREEN', name: 'Evergreen', country: 'Taiwan', apiSupported: true },
  'COSCO': { code: 'COSCO', name: 'COSCO Shipping', country: 'China', apiSupported: true },
  'YANG_MING': { code: 'YANG_MING', name: 'Yang Ming', country: 'Taiwan', apiSupported: true },
  'HMM': { code: 'HMM', name: 'HMM - Hyundai Merchant Marine', country: 'South Korea', apiSupported: true },
  'ZIM': { code: 'ZIM', name: 'ZIM Integrated Shipping', country: 'Israel', apiSupported: true },
  'PIL': { code: 'PIL', name: 'PIL - Pacific International Lines', country: 'Singapore', apiSupported: true },
  'WAN_HAI': { code: 'WAN_HAI', name: 'Wan Hai Lines', country: 'Taiwan', apiSupported: true },
  'SEABOARD': { code: 'SEABOARD', name: 'Seaboard Marine', country: 'USA', apiSupported: false },
  'CROWLEY': { code: 'CROWLEY', name: 'Crowley Maritime', country: 'USA', apiSupported: false },
  'ARKAS': { code: 'ARKAS', name: 'Arkas Line', country: 'Turkey', apiSupported: false },
  'TURKON': { code: 'TURKON', name: 'Turkon Line', country: 'Turkey', apiSupported: false },
  'GRIMALDI': { code: 'GRIMALDI', name: 'Grimaldi Lines', country: 'Italy', apiSupported: false },
  'SM_LINE': { code: 'SM_LINE', name: 'SM Line Corporation', country: 'South Korea', apiSupported: false },
  'TRANSROLL': { code: 'TRANSROLL', name: 'Transroll Navegação', country: 'Brazil', apiSupported: false },
  'UNKNOWN': { code: 'UNKNOWN', name: 'Armador Desconhecido', country: 'Unknown', apiSupported: false },
};

// Nomes legíveis (SCAC -> Nome)
export const SHIPPING_LINE_NAMES: Record<string, string> = {
  "HLCU": "Hapag-Lloyd",
  "MAEU": "Maersk",
  "MSCU": "MSC",
  "MEDU": "MSC",
  "CMDU": "CMA CGM",
  "COSU": "COSCO",
  "EGLV": "Evergreen",
  "ONEY": "ONE (Ocean Network Express)",
  "YMLU": "Yang Ming",
  "HDMU": "Hyundai Merchant Marine",
  "OOLU": "OOCL",
  "ZIMU": "ZIM",
  "ANRM": "ANL",
  "APLU": "APL",
  "SUDU": "Hamburg Süd",
  "NYKU": "NYK Line",
  "MOLU": "MOL",
  "KKLU": "K Line",
  "SEAU": "SEALAND",
  "PCIU": "PIL",
  "WHLC": "WAN HAI",
  "TRHU": "Transroll",
  "SMLM": "SM Line",
  "ARKU": "Arkas",
  "BURU": "BURU",
  "HBG": "Hapag-Lloyd",
  "HBG2": "Hapag-Lloyd",
  "SSZ": "Interno (DACHSER)",
  "GLNL": "Interno (DACHSER)",
  "GLSL": "Interno (DACHSER)",
  "GLDL": "Interno (DACHSER)",
};

/**
 * Detecta o armador a partir do número MBL
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
  
  // Tentar prefixos de 4 caracteres primeiro
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
 * Retorna o nome legível do armador pelo prefixo SCAC
 */
export function getShippingLineNameByScac(scac: string): string {
  return SHIPPING_LINE_NAMES[scac] || scac;
}

/**
 * Normaliza o nome do armador para o código padrão
 */
export function normalizeShippingLine(input: string): ShippingLineCode {
  const upper = input.toUpperCase().trim().replace(/[\s-]+/g, '_');
  
  const aliasMap: Record<string, ShippingLineCode> = {
    'HAPAG': 'HAPAG_LLOYD',
    'HAPAG_LLOYD': 'HAPAG_LLOYD',
    'HL': 'HAPAG_LLOYD',
    'MSC': 'MSC',
    'MAERSK': 'MAERSK',
    'HAMBURG': 'HAMBURG_SUD',
    'HAMBURG_SUD': 'HAMBURG_SUD',
    'CMA': 'CMA_CGM',
    'CMA_CGM': 'CMA_CGM',
    'ONE': 'ONE',
    'EVERGREEN': 'EVERGREEN',
    'COSCO': 'COSCO',
    'OOCL': 'COSCO',
    'YANG_MING': 'YANG_MING',
    'HMM': 'HMM',
    'ZIM': 'ZIM',
    'PIL': 'PIL',
    'WAN_HAI': 'WAN_HAI',
  };
  
  return aliasMap[upper] || 'UNKNOWN';
}

/**
 * Retorna lista de armadores com suporte a tracking API
 */
export function getTrackableCarriers(): ShippingLineInfo[] {
  return Object.values(SHIPPING_LINE_INFO).filter(info => info.apiSupported);
}
