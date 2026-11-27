import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Boja mora biti u formatu #RRGGBB');
const marketEnum = z.enum(['RS', 'BA', 'HR', 'ME', 'XK']);
const sources = z
  .array(z.object({ title: z.string(), url: z.url(), publisher: z.string().optional() }))
  .default([]);
const seo = z.object({
  title: z.string().max(70, 'SEO title do 70 karaktera'),
  description: z.string().min(50).max(170, 'Meta description do 170 karaktera'),
});
const faq = z.array(z.object({ q: z.string(), a: z.string() })).default([]);
const iconEnum = z.enum(['leaf', 'plant', 'drop', 'flower', 'capsule', 'truck', 'hand', 'shield', 'clock', 'root', 'seed', 'box']);

/* ------------------------------------------------------------------ */
/* Kategorije                                                          */
/* ------------------------------------------------------------------ */
const categories = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/categories' }),
  schema: z.object({
    name: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    market: marketEnum.default('RS'),
    shortDescription: z.string(),
    /** Kratak uvod ispod H1. Ako postoji, ceo tekst kategorije ide u odeljak ispod ponuda. */
    intro: z.string().optional(),
    icon: z.enum(['joint', 'detox', 'leaf', 'heart', 'heart-pulse', 'activity', 'weight', 'male', 'eye', 'waves', 'sparkles', 'sleep', 'skin']).default('leaf'),
    order: z.number().default(100),
    seo,
    faq,
    /** FAQPage schema samo kada sadržaj zaista ispunjava Google smernice */
    faqSchema: z.boolean().default(false),
    demo: z.boolean().default(false),
    updatedAt: z.coerce.date(),
  }),
});

/* ------------------------------------------------------------------ */
/* Proizvodi                                                           */
/* ------------------------------------------------------------------ */
const products = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/products' }),
  schema: ({ image }) =>
    z.object({
      // Osnovno
      name: z.string(),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      category: reference('categories'),
      market: marketEnum.default('RS'),
      productType: z.string(),
      h1: z.string().optional(),
      shortDescription: z.string().max(160),
      intro: z.string(),
      highlights: z.array(z.object({ icon: iconEnum, label: z.string() })).max(3).default([]),
      featured: z.boolean().default(false),
      /** Redosled prikaza (manji broj = ranije) */
      sortOrder: z.number().default(100),
      draft: z.boolean().default(false),
      demo: z.boolean().default(false),
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date(),

      // Slike i vizuelna tema
      heroImage: image(),
      heroImageAlt: z.string(),
      gallery: z.array(z.object({ src: image(), alt: z.string() })).default([]),
      brandLogo: image().optional(),
      themePrimary: hex.optional(),
      themeSecondary: hex.optional(),
      themeBackground: hex.optional(),
      themeAccent: hex.optional(),

      // Sadržaj
      ingredients: z
        .array(z.object({ name: z.string(), latin: z.string().optional(), description: z.string(), icon: iconEnum.default('leaf') }))
        .default([]),
      ingredientsNote: z.string().optional(),
      /** Istaknuta sekcija „Sastav“: slika, aktivni sastojak, INCI lista i oznake */
      composition: z
        .object({
          eyebrow: z.string().default('Sastav'),
          title: z.string(),
          image: image().optional(),
          imageAlt: z.string().optional(),
          activeLabel: z.string().default('Aktivni sastojak'),
          activeName: z.string(),
          activeLatin: z.string().optional(),
          inci: z.string(),
          tags: z.array(z.string()).default([]),
          sourceName: z.string().optional(),
          checkedAt: z.coerce.date().optional(),
        })
        .optional(),
      /**
       * Komentari preuzeti sa sajta prodavca, uvek prikazani uz naziv izvora.
       * Nisu recenzije kupaca ovog sajta i ne ulaze u JSON-LD.
       */
      quotedReviews: z
        .object({
          sourceName: z.string(),
          sourceUrl: z.url(),
          checkedAt: z.coerce.date(),
          items: z
            .array(z.object({ text: z.string(), initials: z.string().max(6), score: z.number().min(1).max(5) }))
            .min(1),
        })
        .optional(),
      usage: z.array(z.string()).default([]),
      notFor: z.array(z.string()).default([]),
      warnings: z.array(z.string()).default([]),
      comparison: z
        .object({
          intro: z.string().optional(),
          columns: z.array(z.string()).min(2),
          rows: z.array(z.object({ label: z.string(), values: z.array(z.string()) })),
          note: z.string().optional(),
        })
        .optional(),
      faq,
      /** FAQPage schema samo kada sadržaj zaista ispunjava Google smernice */
      faqSchema: z.boolean().default(false),
      sources,

      // Cene i pakovanja
      currency: z.string().default('RSD'),
      priceStatus: z.enum(['verified', 'demo', 'unknown']).default('unknown'),
      priceCheckedAt: z.coerce.date().optional(),
      priceSource: z.string().optional(),
      packages: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9-]+$/),
            label: z.string(),
            quantity: z.number().int().positive(),
            price: z.number().positive().optional(),
            /** Opciono: poseban offer ID za ovo pakovanje (ako MonadLead to tako vodi) */
            offerId: z.string().optional(),
            default: z.boolean().default(false),
          }),
        )
        .min(1),

      // Porudžbine / CRM
      offerId: z.string(),
      countryCode: marketEnum.default('RS'),
      orderEnabled: z.boolean().default(true),

      // Video iskustva
      videoSectionTitle: z.string().optional(),
      videos: z
        .array(
          z
            .object({
              type: z.enum(['instagram', 'hosted']),
              url: z.url().optional(),
              src: z.string().optional(),
              thumbnail: image(),
              title: z.string(),
              author: z.string().optional(),
              /** Ime autora se prikazuje samo uz njegovu dozvolu */
              authorConsent: z.boolean().default(false),
              description: z.string().optional(),
              sourceUrl: z.url().optional(),
              permission: z.object({
                granted: z.boolean(),
                date: z.coerce.date().optional(),
                reference: z.string().optional(),
              }),
              /** true samo ako je potvrđeno da je autor kupio i koristio proizvod */
              verifiedPurchase: z.boolean().default(false),
              demo: z.boolean().default(false),
            })
            .refine((v) => (v.type === 'instagram' ? !!v.url : !!v.src), {
              message: 'Instagram video traži "url", hostovani video traži "src"',
            }),
        )
        .default([]),

      related: z.array(reference('products')).default([]),
      seo,
    }),
});

/* ------------------------------------------------------------------ */
/* Vodiči                                                              */
/* ------------------------------------------------------------------ */
const guides = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/guides' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      market: marketEnum.default('RS'),
      description: z.string(),
      category: reference('categories').optional(),
      heroImage: image().optional(),
      heroImageAlt: z.string().optional(),
      author: z.object({ name: z.string(), role: z.string().optional() }),
      reviewedBy: z.object({ name: z.string(), credentials: z.string() }).optional(),
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date(),
      readingMinutes: z.number().optional(),
      sources,
      relatedProducts: z.array(reference('products')).default([]),
      faq,
      faqSchema: z.boolean().default(false),
      demo: z.boolean().default(false),
      draft: z.boolean().default(false),
      seo,
    }),
});

export const collections = { categories, products, guides };
