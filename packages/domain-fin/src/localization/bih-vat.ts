/**
 * BiH accounting localization pack "accounting-bih" (FIN-028) — DATA,
 * not code branches. Installing it copies these rate versions into the
 * legal entity's own effective-dated VAT configuration, where the tenant
 * can add later versions; the core never reads this constant at posting
 * time. The system-account roles (vat.output / vat.input /
 * vat.settlement) are mapped per legal entity through FIN-024.
 */
export const BIH_VAT_PACK = {
  key: 'accounting-bih',
  rates: [
    { code: 'S17', name: 'PDV opća stopa 17%', ratePct: 17, validFrom: '2006-01-01' },
    { code: 'O0', name: 'Oslobođeno PDV-a (0%)', ratePct: 0, validFrom: '2006-01-01' },
  ],
} as const;
