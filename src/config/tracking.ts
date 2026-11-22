/**
 * Tracking konfiguracija (deli se između browsera i servera — ovde NEMA tajni).
 *
 * Browser na ulasku hvata UTM, click ID i sub parametre iz URL-a i čuva ih u sessionStorage
 * (bez ličnih podataka). Server ih validira i mapira na MonadLead sub_1–sub_4.
 */

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

/** Click ID parametri reklamnih mreža i affiliate platformi — redosled = prioritet */
export const CLICK_ID_KEYS = [
  'gclid', 'gbraid', 'wbraid', // Google Ads
  'fbclid', // Meta
  'ttclid', // TikTok
  'msclkid', // Microsoft Ads
  'click_id', 'clickid', 'cid', 'subid', 'aff_sub', 'aff_click_id', // affiliate
] as const;

/** Sub parametri koje partner može direktno da prosledi u URL-u */
export const SUB_KEYS = ['sub_1', 'sub_2', 'sub_3', 'sub_4', 'sub1', 'sub2', 'sub3', 'sub4', 'aff_id', 'affiliate_id', 'source'] as const;

export const ALL_TRACKED_KEYS: readonly string[] = [...UTM_KEYS, ...CLICK_ID_KEYS, ...SUB_KEYS];

/**
 * Mapiranje MonadLead sub_1–sub_4.
 * Za svako polje navodi se lista izvora; koristi se PRVI koji ima vrednost.
 *
 * Izvori:
 *  - 'param:<ime>'   vrednost iz URL parametra (npr. param:sub_1 koji je poslao affiliate)
 *  - 'utm:<ime>'     utm_source, utm_medium...
 *  - 'derived:source' / 'derived:medium'  izračunat kanal (google/organic, facebook/paid...)
 *  - 'clickid'       prvi pronađeni click ID iz CLICK_ID_KEYS (gclid, fbclid, click_id...)
 *  - 'clickid_key'   NAZIV parametra iz kog je click ID (npr. "gclid")
 *  - 'product:slug'  slug proizvoda
 *  - 'package:id'    izabrano pakovanje
 *  - 'visit:id'      nasumični ID posete (generiše browser, nije lični podatak)
 *  - 'const:<tekst>' fiksna vrednost
 *
 * Primer iz MonadLead dokumentacije: sub_1=google, sub_2=organic, sub_3=product_slug, sub_4=tracking_id
 */
export const SUB_MAPPING: Record<'sub_1' | 'sub_2' | 'sub_3' | 'sub_4', string[]> = {
  sub_1: ['param:sub_1', 'param:sub1', 'utm:utm_source', 'derived:source'],
  sub_2: ['param:sub_2', 'param:sub2', 'utm:utm_medium', 'derived:medium'],
  sub_3: ['param:sub_3', 'param:sub3', 'product:slug'],
  sub_4: ['param:sub_4', 'param:sub4', 'clickid', 'visit:id'],
};

/** Maksimalna dužina bilo koje tracking vrednosti */
export const MAX_TRACKING_VALUE_LENGTH = 200;
