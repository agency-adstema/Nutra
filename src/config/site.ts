/**
 * Glavna konfiguracija sajta.
 * Naziv sajta se menja SAMO ovde (naziv: Moja Zdravica).
 * Sajt vodi fizičko lice kao affiliate partner (nije firma), pa polja za firmu ostaju prazna.
 * Ako se kasnije registruje firma/preduzetnik, upisati naziv, MB, PIB i adresu.
 */
export const site = {
  name: 'Moja Zdravica',
  /** Tekst logotipa u headeru/footeru */
  logoText: 'Moja Zdravica',
  tagline: 'Prirodni preparati: sastav, upotreba, cene i upozorenja',
  description:
    'Informativni vodič kroz prirodne preparate za Srbiju, Bosnu i Hercegovinu i Hrvatsku: sastav, način upotrebe, upozorenja i informacije o cenama.',
  language: 'sr-Latn',
  defaultMarket: 'RS' as const,

  /** Operater sajta — prikazuje se u footeru, pravnim stranicama i schema.org Organization */
  operator: {
    companyName: '',
    registrationNumber: '',
    taxId: '',
    address: '',
    country: 'Srbija',
    email: 'kontakt@zdravica.rs',
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
    { label: 'Ponude', href: '/ponude/' },
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
