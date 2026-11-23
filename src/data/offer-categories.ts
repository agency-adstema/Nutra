import { offers, type Offer, type OfferGeo } from './offers';

/**
 * Match catalog verticals to the existing Nutra RS editorial categories.
 * A vertical absent from this mapping remains available under /ponude/<geo>/;
 * don't mislabel Hearing as Vision or Cystitis as Prostatitis.
 */
const verticalsByCategory: Record<string, string[]> = {
  'zglobovi-i-bolovi': ['Joints', 'Muscle'],
  'paraziti-i-detoks': ['Parasites'],
  'vid-i-oci': ['Vision'],
  'koza-kosa-i-nokti': ['Fungus', 'Hair', 'Beauty', 'Health & Beauty'],
  'mrsavljenje-i-metabolizam': ['Weight Loss'],
  'prostata-i-musko-zdravlje': ['Prostatitis', 'Potency', 'Male Enlargement'],
  'secer-u-krvi': ['Diabetes'],
  'srce-i-pritisak': ['Hypertension'],
  'vene-i-cirkulacija': ['Varicose'],
};

export function getCatalogOffersForCategory(categorySlug: string, geo: OfferGeo = 'RS'): Offer[] {
  const verticals = verticalsByCategory[categorySlug] ?? [];
  return offers.filter((offer) => offer.geo === geo && offer.verticals.some((v) => verticals.includes(v)));
}

export const categoryForVertical = (vertical: string) =>
  Object.entries(verticalsByCategory).find(([, verticals]) => verticals.includes(vertical))?.[0];
