/**
 * Koje stranice kataloga (/ponude/) Google indeksira.
 * zdravica.rs je sajt za Srbiju: indeksiraju se ponude za RS koje su aktivne u partnerskom nalogu.
 * BA i HR ostaju dostupne posetiocima, ali bez indeksiranja (isti proizvodi, druga tržišta — bez hreflang verzija).
 */
import { offers, type Offer, type OfferGeo } from './offers';
import { getOfferDetails } from './offer-details';

export const INDEXED_GEO: OfferGeo = 'RS';

export function isGeoIndexable(geo: OfferGeo): boolean {
  return geo === INDEXED_GEO;
}

export function isOfferIndexable(offer: Offer): boolean {
  return isGeoIndexable(offer.geo) && getOfferDetails(offer.geo, offer.slug)?.availableInAccount === true;
}

export function indexableOffers(): Offer[] {
  return offers.filter(isOfferIndexable);
}
