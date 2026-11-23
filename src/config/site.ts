/**
 * Glavna konfiguracija sajta.
 * Naziv sajta se menja SAMO ovde (radni naziv: Biljni kompas).
 * Polja sa [POPUNITI] moraju biti zamenjena stvarnim podacima pre produkcije —
 * `npm run check:prod` pada dok god postoje.
 */
export const site = {
  name: 'Biljni kompas',
  /** Tekst logotipa u headeru/footeru */
  logoText: 'biljni kompas.',
  tagline: 'Prirodni preparati: sastav, upotreba, cene i upozorenja',
  description:
    'Informativni vodič kroz prirodne preparate za Srbiju, Bosnu i Hercegovinu i Hrvatsku: sastav, način upotrebe, upozorenja i informacije o cenama.',
  language: 'sr-Latn',
  defaultMarket: 'RS' as const,

  /** Operater sajta — prikazuje se u footeru, pravnim stranicama i schema.org Organization */
  operator: {
    companyName: '[POPUNITI: pun naziv firme / preduzetnika]',
    registrationNumber: '[POPUNITI: matični broj]',
    taxId: '[POPUNITI: PIB]',
    address: '[POPUNITI: ulica i broj, poštanski broj, mesto]',
    country: 'Srbija',
    email: '[POPUNITI: kontakt@domen.rs]',
    phone: '' as string, // opciono — ako se doda, prikazuje se kao tel: link (GA4 click_phone)
  },

  /** Ko obrađuje porudžbine (prikazuje se uz formu i na /obrada-porudzbina/) */
  orderProcessing: {
    networkName: 'MonadLead',
    sellerDescription:
      'prodavac ili distributer proizvoda i njegov call centar',
    deliveryNote: 'Plaćanje pouzećem, dostava prema uslovima prodavca.',
  },

  /** Saglasnost u formi: 'checkbox' kada je saglasnost pravni osnov, 'notice' kada je osnov izvršenje ugovora */
  consentMode: 'checkbox' as 'checkbox' | 'notice',

  social: {
    instagram: '',
  },

  nav: [
    { label: 'Vodiči', href: '/vodici/' },
    { label: 'O nama', href: '/o-nama/' },
  ],

  footerLinks: [
    { label: 'O nama', href: '/o-nama/' },
    { label: 'Kontakt', href: '/kontakt/' },
    { label: 'Kako pišemo', href: '/kako-pisemo/' },
    { label: 'Obrada porudžbina', href: '/obrada-porudzbina/' },
    { label: 'Politika privatnosti', href: '/politika-privatnosti/' },
    { label: 'Kolačići', href: '/kolacici/' },
    { label: 'Uslovi korišćenja', href: '/uslovi-koriscenja/' },
  ],

  medicalDisclaimer: 'Informativni sadržaj. Nije zamena za savet lekara.',
} as const;

/** Stranice čiji slug ne sme da se koristi kao slug kategorije */
export const reservedSlugs = [
  'vodici',
  'o-nama',
  'kontakt',
  'kako-pisemo',
  'politika-privatnosti',
  'kolacici',
  'uslovi-koriscenja',
  'obrada-porudzbina',
  'affiliate-izjava',
  'pretraga',
  'api',
];
