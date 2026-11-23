/**
 * Second MonadLead advertiser account: RS offer IDs supplied by site operator 23 Nov 2026.
 * 100 received rows -> 93 unique pairs; seven verbatim repeated rows removed.
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
463|HP O Caps
464|TestoY Gel
538|Keto Tea
569|Para Caps
584|HP Mikoherb
585|HP Diatea
586|HP Prostamid
587|HP Varcosin
588|HP GoSlim
613|HP Hemomax
617|HP Parazol
624|HP U Caps
627|HP Quick Fit
632|Altea
643|HP Altea
645|HP Beauty Derm
658|HP TestoY
673|HP Nefro Aktiv
680|HP Cellulflex
684|HP HydroMax
706|HP Pro Caps
713|HP Wrinkless
717|HP Bone Control
727|HP Para Caps
729|HP Lossless
732|HP Apollos
747|PreNutra
805|HP Go Potent
880|HP Deep Inhale
1007|SecretDiet
1018|HP Dermal
1047|HP TestoY Gel
1189|HP Nautubone
1191|HP Hypertea
1192|HP Hemoroclear
1317|Power Pulse XXL
1423|Para Clean
1490|Liv Caps
1491|Viva Lift
1492|Gluco Caps
1493|Slim Ease
1494|Cardio Zen
1527|Dia Caps
1633|HP Slim Ease
1655|Vivus Steam Mop 9 in 1
1656|Kitchen Mixer/Blender
1657|TurboFry MultiChef 3in1
1662|HP Pro Drops
1670|Caffitaly
1690|Vasculief
1756|Valerisan
1757|HP Valerisan
1768|Erek X
1769|HP Erek X
`.trim();

const idsBySlug = new Map<string,string>();
const namesById = new Map<string,string>();
for(const line of rsSource.split('\n')){
  const [id,name]=line.split('|');
  if(!/^\d+$/.test(id||'') || !name) throw new Error('Invalid supplied RS offer record');
  const slug=slugifyOffer(name);
  if(idsBySlug.has(slug) && idsBySlug.get(slug)!==id) throw new Error(`RS offer conflict for ${slug}`);
  if(namesById.has(id) && namesById.get(id)!==slug) throw new Error(`RS offer ID ${id} assigned to multiple names`);
  idsBySlug.set(slug,id);
  namesById.set(id,slug);
}

export const suppliedRsOfferCount=idsBySlug.size;

/**
 * Exact match by GEO + slug, no fuzzy matching:
 * - HP TestoY Gel 1047 is DIFFERENT from TestoY Gel 464 and TestoY 59.
 * - HP Nautubone 1189 is DIFFERENT from Nautubone 51.
 * - Editorial product slug "bonecontrol" is an established alias for "Bone Control".
 */
export function getSuppliedOfferId(geo: string, slug: string): string | undefined {
  if(geo !== 'RS') return undefined;
  const normalised = slug === 'bonecontrol' ? 'bone-control' : slug;
  return idsBySlug.get(normalised);
}
