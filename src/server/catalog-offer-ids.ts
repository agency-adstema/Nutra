/**
 * Second MonadLead advertiser account: RS, BA, HR offer IDs supplied by site operator 23 Nov 2026.
 * Seven verbatim repeated rows removed. All "HP" offers were removed on 23 Nov 2026
 * (merchant decision: they duplicated the regular products).
 *
 * Offer IDs are identifiers, not credentials. The API KEY remains server-only in
 * MONADLEAD_API_KEY_CATALOG. Do not set ORDER_MODE=live merely because IDs are present.
 * Entries for offers not yet in /ponude/ remain dormant.
 */
import { slugifyOffer } from '../data/offers';

const rsSource = `
49|Pure Argan Oil
50|GoSlim
51|Nautubone
52|GoPotent
53|Varcosin
54|Parazol
55|Prostamid
56|Dermal
57|Hypertea
58|Diatea
59|TestoY
60|Quick Fit
97|Easy Slim
98|Omni Potent
99|Varcolex
100|Bone Control
112|Beauty Derm
114|Hyper Drops
117|Lossless
119|Mikoherb
132|Mikotea
133|Hemomax
134|Pro Drops
135|Dia Drops
154|Deep Inhale
155|Apolloss
156|Hydromax
157|Fertilitea
166|Nefro Aktiv
178|Hyper Caps
285|Hemoroclear
286|Wrinkless
289|Pro Caps
290|O caps
313|Acnosin
314|Intimotea
401|Cellulflex
416|AdipoStop
426|U Caps
464|TestoY Gel
538|Keto Tea
569|Para Caps
632|Altea
747|PreNutra
1007|SecretDiet
1317|Power Pulse XXL
1423|Para Clean
1490|Liv Caps
1491|Viva Lift
1492|Gluco Caps
1493|Slim Ease
1494|Cardio Zen
1527|Dia Caps
1655|Vivus Steam Mop 9 in 1
1656|Kitchen Mixer/Blender
1657|TurboFry MultiChef 3in1
1670|Caffitaly
1690|Vasculief
1756|Valerisan
1768|Erek X
`.trim();


const hrSource = `
302|Beauty Derm
752|CY-relief
1167|Deep Inhale
92|Diatea
301|Mikoherb
90|Nautubone
315|Pro Caps
95|Varcosin
`.trim();

const baSource = `
862|CY-relief
17|Nautubone
18|Parazol
292|Pro Caps
`.trim();

const idsByGeo = new Map<string, Map<string, string>>();
for (const [geo, source] of [['RS', rsSource], ['HR', hrSource], ['BA', baSource]] as const) {
  const idsBySlug = new Map<string, string>();
  const namesById = new Map<string, string>();
  for (const line of source.split('\n')) {
    const [id, name] = line.split('|');
    if (!/^\d+$/.test(id || '') || !name) throw new Error(`Invalid supplied ${geo} offer record`);
    const slug = slugifyOffer(name);
    if (idsBySlug.has(slug) && idsBySlug.get(slug) !== id) throw new Error(`${geo} offer conflict for ${slug}`);
    if (namesById.has(id) && namesById.get(id) !== slug) throw new Error(`${geo} offer ID ${id} used for multiple names`);
    idsBySlug.set(slug, id);
    namesById.set(id, slug);
  }
  idsByGeo.set(geo, idsBySlug);
}

export const suppliedRsOfferCount = idsByGeo.get('RS')!.size;
export const suppliedHrOfferCount = idsByGeo.get('HR')!.size;
export const suppliedBaOfferCount = idsByGeo.get('BA')!.size;

/** Exact GEO + slug matching, with only the established BoneControl editorial alias. */
export function getSuppliedOfferId(geo: string, slug: string): string | undefined {
  const normalised = geo === 'RS' && slug === 'bonecontrol' ? 'bone-control' : slug;
  return idsByGeo.get(geo)?.get(normalised);
}
