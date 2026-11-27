/**
 * JSON-LD (schema.org) generatori.
 * Pravila: bez izmišljenih ocena, recenzija, cena, ponuda ili dostupnosti.
 * Product.offers se dodaje SAMO kada je cena proverena (priceStatus: verified + datum).
 */
import { site } from '../config/site';

export const isPlaceholder = (s?: string) => !s || /\[POPUNITI/i.test(s);

type Json = Record<string, unknown>;

export function organizationSchema(siteUrl: string): Json {
  const op = site.operator;
  const org: Json = {
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: site.name,
    url: `${siteUrl}/`,
    logo: { '@type': 'ImageObject', url: `${siteUrl}/logo.png` },
  };
  if (!isPlaceholder(op.companyName)) org.legalName = op.companyName;
  if (!isPlaceholder(op.email)) org.email = op.email;
  if (!isPlaceholder(op.address)) org.address = { '@type': 'PostalAddress', streetAddress: op.address, addressCountry: 'RS' };
  if (op.phone) org.telephone = op.phone;
  return org;
}

export function websiteSchema(siteUrl: string): Json {
  return {
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    url: `${siteUrl}/`,
    name: site.name,
    inLanguage: site.language,
    publisher: { '@id': `${siteUrl}/#organization` },
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]): Json {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

export interface ProductSchemaInput {
  url: string;
  name: string;
  description: string;
  image: string;
  category: string;
  priceStatus: 'verified' | 'demo' | 'unknown';
  priceCheckedAt?: Date;
  currency: string;
  prices: number[];
}

/**
 * Product šema samo kada imamo potvrđenu cenu (offers). Google za Product traži
 * offers, review ili aggregateRating; bez toga Search Console prijavljuje grešku,
 * a ocene i recenzije ne izmišljamo. Bez potvrđene cene vraća null.
 */
export function productSchema(p: ProductSchemaInput): Json | null {
  if (!(p.priceStatus === 'verified' && p.priceCheckedAt && p.prices.length > 0)) return null;
  const node: Json = {
    '@type': 'Product',
    '@id': `${p.url}#product`,
    name: p.name,
    description: p.description,
    image: [p.image],
    category: p.category,
    brand: { '@type': 'Brand', name: p.name },
  };
  if (p.priceStatus === 'verified' && p.priceCheckedAt && p.prices.length > 0) {
    node.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: p.currency,
      lowPrice: Math.min(...p.prices),
      highPrice: Math.max(...p.prices),
      offerCount: p.prices.length,
      url: p.url,
    };
  }
  return node;
}

export interface ArticleSchemaInput {
  url: string;
  headline: string;
  description: string;
  image: string;
  datePublished: Date;
  dateModified: Date;
  authorName: string;
  siteUrl: string;
}

export function articleSchema(a: ArticleSchemaInput): Json {
  return {
    '@type': 'Article',
    '@id': `${a.url}#article`,
    headline: a.headline.slice(0, 110),
    description: a.description,
    image: [a.image],
    datePublished: a.datePublished.toISOString(),
    dateModified: a.dateModified.toISOString(),
    author: { '@type': 'Organization', name: a.authorName, url: `${a.siteUrl}/kako-pisemo/` },
    publisher: { '@id': `${a.siteUrl}/#organization` },
    mainEntityOfPage: a.url,
    inLanguage: site.language,
  };
}

export function faqSchema(faq: { q: string; a: string }[]): Json {
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}
