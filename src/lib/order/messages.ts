/** Poruke korisniku (sr-Latn). Dele ih forma u browseru i server. */
export const orderMessages = {
  required_firstName: 'Unesite ime.',
  required_lastName: 'Unesite prezime.',
  invalid_name: 'Koristite samo slova, razmak, crticu ili apostrof.',
  phone_empty: 'Unesite broj telefona.',
  phone_invalid_chars: 'Broj telefona može sadržati samo cifre, razmake i znak +.',
  phone_wrong_country: 'Unesite broj iz Srbije (počinje sa 06… ili +381).',
  phone_invalid_length: 'Broj telefona nema ispravan broj cifara.',
  phone_invalid: 'Proverite broj telefona (npr. 060 123 45 67).',
  package_invalid: 'Izaberite pakovanje.',
  consent_required: 'Potrebna je saglasnost za obradu podataka radi porudžbine.',

  success: 'Porudžbina je uspešno poslata. Operater će vas uskoro kontaktirati radi potvrde.',
  test_mode:
    'Testni režim: podaci su ispravni, ali porudžbina NIJE poslata (CRM još nije povezan).',
  static_preview:
    'Preview režim: forma je proverena u browseru, ali server nije aktivan — porudžbina NIJE poslata.',
  duplicate:
    'Porudžbinu sa ovim brojem telefona smo već primili. Operater će vas kontaktirati — nije potrebno slati ponovo.',
  in_progress: 'Vaša porudžbina se već šalje. Sačekajte nekoliko sekundi.',
  rate_limited: 'Previše pokušaja. Pokušajte ponovo za nekoliko minuta.',
  bot_suspected: 'Slanje nije uspelo. Osvežite stranicu i pokušajte ponovo.',
  too_fast: 'Forma je poslata prebrzo. Proverite podatke i pošaljite ponovo.',
  captcha_failed: 'Potvrda da niste robot nije uspela. Pokušajte ponovo.',
  invalid_request: 'Zahtev nije ispravan. Osvežite stranicu i pokušajte ponovo.',
  crm_validation: 'Proverite unete podatke i pokušajte ponovo.',
  crm_phone: 'Sistem za porudžbine nije prihvatio broj telefona. Proverite ga i pokušajte ponovo.',
  crm_name: 'Sistem za porudžbine nije prihvatio ime. Proverite ga i pokušajte ponovo.',
  server_error: 'Servis za porudžbine trenutno nije dostupan. Pokušajte ponovo za nekoliko minuta.',
  config_error: 'Tehnička greška pri slanju porudžbine. Pokušajte ponovo kasnije.',
  network_error: 'Veza je prekinuta. Proverite internet i pokušajte ponovo.',
  timeout_uncertain:
    'Nismo dobili potvrdu od sistema za porudžbine, pa ne znamo da li je porudžbina primljena. Ne šaljite ponovo odmah — ako vas operater ne pozove u roku od sat vremena, pokušajte ponovo.',
  unavailable: 'Poručivanje ovog proizvoda trenutno nije dostupno.',
} as const;

export type OrderMessageKey = keyof typeof orderMessages;

export type OrderApiStatus =
  | 'created'
  | 'test_mode'
  | 'duplicate'
  | 'in_progress'
  | 'invalid'
  | 'rate_limited'
  | 'error';

export interface OrderApiResponse {
  status: OrderApiStatus;
  message: string;
  code?: string;
  fieldErrors?: Record<string, string>;
  orderId?: string;
  /** Samo u test režimu — šta bi bilo poslato (bez API ključa) */
  preview?: Record<string, unknown>;
}
