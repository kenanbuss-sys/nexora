'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useApp } from '../app-shell';

/**
 * In-app guide ("Vodič"): step-by-step instructions per role for the
 * made-to-measure flow (upit → mjerenje → ponuda → narudžba → avans →
 * proizvodnja → montaža → faktura). Static content only; every action
 * it points to is authorized on the server by the target screen.
 */

type RoleKey = 'prodavac' | 'proizvodnja' | 'montaza' | 'knjigovodstvo' | 'uprava';

interface Step {
  /** Cilj koraka — šta korisnik postiže. */
  goal: string;
  /** Meni i dugmad kojima se stiže do cilja. */
  click: string;
  /** Rezultat koji korisnik treba da vidi. */
  expect: string;
  href: string;
  linkLabel: string;
  /** Dozvola potrebna za ciljni ekran (samo za objašnjenje blokade). */
  permission: string;
}

interface RoleGuide {
  key: RoleKey;
  label: string;
  /** Dozvola po kojoj se ova uloga bira kao podrazumijevana. */
  defaultFor: string;
  intro: string;
  steps: Step[];
}

const GUIDES: RoleGuide[] = [
  {
    key: 'prodavac',
    label: 'Prodavač',
    defaultFor: 'quote.create',
    intro:
      'Od prvog upita kupca do potvrđene narudžbe s avansom. Svaki proizvod se radi po mjeri, pa mjerenje dolazi prije ponude.',
    steps: [
      {
        goal: 'Zabilježi upit i kupca',
        click:
          'Klikni CRM → Novi lead (ili Kupci ako kupac već postoji) i unesi kontakt i adresu objekta.',
        expect: 'Treba da vidiš kupca ili lead u listi, spreman za dalji rad.',
        href: '/crm',
        linkLabel: 'Otvori CRM',
        permission: 'crm.read',
      },
      {
        goal: 'Zakaži mjerenje na objektu',
        click: 'Klikni Montaže → Novo mjerenje, izaberi kupca, adresu i termin.',
        expect: 'Treba da vidiš mjerenje u sedmičnom pregledu Montaža sa statusom zakazano.',
        href: '/installations',
        linkLabel: 'Otvori Montaže',
        permission: 'service.read',
      },
      {
        goal: 'Napravi ponudu sa stavkom po mjeri',
        click:
          'Klikni Ponude → nova ponuda → Stavka po mjeri. Unesi širinu, visinu i broj komada, dodaj doplate (RAL boja, motor) i montažu.',
        expect: 'Treba da vidiš stavku s izračunatom cijenom i ukupan iznos ponude.',
        href: '/quotes',
        linkLabel: 'Otvori Ponude',
        permission: 'quote.read',
      },
      {
        goal: 'Pošalji ponudu i evidentiraj prihvatanje',
        click: 'Klikni Pošalji na ponudi; kad kupac pristane, klikni Prihvati.',
        expect: 'Treba da vidiš status ponude Poslana, pa Prihvaćena.',
        href: '/quotes',
        linkLabel: 'Otvori Ponude',
        permission: 'quote.read',
      },
      {
        goal: 'Kreiraj narudžbu iz ponude',
        click: 'Na prihvaćenoj ponudi klikni Kreiraj narudžbu.',
        expect: 'Treba da vidiš novu narudžbu sa svim stavkama i mjerama iz ponude.',
        href: '/orders',
        linkLabel: 'Otvori Narudžbe',
        permission: 'order.read',
      },
      {
        goal: 'Potvrdi narudžbu',
        click: 'Klikni Narudžbe → otvori narudžbu → Potvrdi.',
        expect: 'Treba da vidiš status Potvrđena; narudžba je spremna za avans i proizvodnju.',
        href: '/orders',
        linkLabel: 'Otvori Narudžbe',
        permission: 'order.read',
      },
      {
        goal: 'Izdaj avansni račun',
        click: 'Klikni Narudžbe → Tok narudžbe → Izdaj avans i unesi iznos ili procenat.',
        expect: 'Treba da vidiš izdat avans na narudžbi; knjigovodstvo ga vidi u finansijama.',
        href: '/orders',
        linkLabel: 'Otvori Narudžbe',
        permission: 'order.read',
      },
      {
        goal: 'Veleprodaja: pusti kupce da naručuju sami',
        click: 'Klikni B2B portal → Pristup portalu i dodijeli pristup veleprodajnom kupcu.',
        expect: 'Treba da vidiš kupca s aktivnim pristupom; njegove narudžbe stižu u Narudžbe.',
        href: '/portal',
        linkLabel: 'Otvori B2B portal',
        permission: 'portal.manage',
      },
    ],
  },
  {
    key: 'proizvodnja',
    label: 'Proizvodnja',
    defaultFor: 'production.manage',
    intro:
      'Od potvrđene narudžbe do gotovog proizvoda spremnog za montažu. Mjere dolaze iz ponude, ne prepisuju se ručno.',
    steps: [
      {
        goal: 'Pokreni proizvodnju za narudžbu',
        click: 'Klikni Narudžbe → otvori potvrđenu narudžbu → Tok narudžbe → Pokreni proizvodnju.',
        expect: 'Treba da vidiš kreiran radni nalog povezan s narudžbom.',
        href: '/orders',
        linkLabel: 'Otvori Narudžbe',
        permission: 'order.read',
      },
      {
        goal: 'Provjeri mjere na radnom nalogu',
        click: 'Klikni Proizvodnja → otvori radni nalog → Mjere.',
        expect: 'Treba da vidiš širinu, visinu, komade i doplate (RAL, motor) za svaku stavku.',
        href: '/production',
        linkLabel: 'Otvori Proizvodnju',
        permission: 'production.read',
      },
      {
        goal: 'Pusti nalog u rad',
        click: 'Na radnom nalogu klikni Pusti.',
        expect: 'Treba da vidiš status Pušten; nalog je vidljiv u pogonu.',
        href: '/production',
        linkLabel: 'Otvori Proizvodnju',
        permission: 'production.read',
      },
      {
        goal: 'Započni rad',
        click: 'Klikni Započni kad izrada stvarno počne.',
        expect: 'Treba da vidiš status U radu i vrijeme početka.',
        href: '/production',
        linkLabel: 'Otvori Proizvodnju',
        permission: 'production.read',
      },
      {
        goal: 'Završi nalog s dobrom količinom',
        click: 'Klikni Završi i unesi dobru količinu (i škart, ako ga ima).',
        expect: 'Treba da vidiš status Završen; gotovi komadi ulaze u zalihu preko knjiženja.',
        href: '/production',
        linkLabel: 'Otvori Proizvodnju',
        permission: 'production.read',
      },
      {
        goal: 'Oslobodi rezervaciju na narudžbi',
        click: 'Klikni Narudžbe → otvori narudžbu → Oslobodi rezervaciju.',
        expect: 'Treba da vidiš da narudžba više ne drži rezervisanu robu i spremna je za montažu.',
        href: '/orders',
        linkLabel: 'Otvori Narudžbe',
        permission: 'order.read',
      },
    ],
  },
  {
    key: 'montaza',
    label: 'Montaža',
    defaultFor: 'service.manage',
    intro:
      'Planiranje ekipa i vozila po sedmici, i rad na terenu od dolaska do izvještaja o završenoj montaži.',
    steps: [
      {
        goal: 'Pregledaj sedmicu',
        click: 'Klikni Montaže i izaberi sedmicu.',
        expect:
          'Treba da vidiš sva mjerenja, montaže i servise po danima, kao i poslove bez termina.',
        href: '/installations',
        linkLabel: 'Otvori Montaže',
        permission: 'service.read',
      },
      {
        goal: 'Otvori termin',
        click: 'Klikni na posao u sedmici ili u listi bez termina.',
        expect: 'Treba da vidiš narudžbu, adresu objekta, mjere i napomene kupca.',
        href: '/installations',
        linkLabel: 'Otvori Montaže',
        permission: 'service.read',
      },
      {
        goal: 'Zakaži ekipu i vozilo',
        click: 'Izaberi datum, vrijeme, ekipu i vozilo, pa klikni Zakaži.',
        expect:
          'Treba da vidiš posao u kalendaru. Ako su ekipa ili vozilo već zauzeti, sistem prijavi konflikt i ne zakazuje.',
        href: '/installations',
        linkLabel: 'Otvori Montaže',
        permission: 'service.read',
      },
      {
        goal: 'Na terenu: započni montažu',
        click: 'Po dolasku na objekat otvori termin i klikni Započni.',
        expect: 'Treba da vidiš status U toku.',
        href: '/installations',
        linkLabel: 'Otvori Montaže',
        permission: 'service.read',
      },
      {
        goal: 'Završi uz izvještaj',
        click: 'Klikni Završi i upiši izvještaj (šta je urađeno, napomene, eventualni nedostaci).',
        expect: 'Treba da vidiš status Završeno; knjigovodstvo može izdati konačnu fakturu.',
        href: '/installations',
        linkLabel: 'Otvori Montaže',
        permission: 'service.read',
      },
    ],
  },
  {
    key: 'knjigovodstvo',
    label: 'Knjigovodstvo',
    defaultFor: 'finance.invoice',
    intro:
      'Avans, isporuka, konačna faktura umanjena za avans, uplata i PDV evidencija — bez ručnog prepisivanja.',
    steps: [
      {
        goal: 'Provjeri avans',
        click: 'Klikni Narudžbe → otvori narudžbu → Tok narudžbe i pogledaj izdat avans.',
        expect:
          'Treba da vidiš avansni račun. Ako je automatsko knjiženje uključeno, KIF stavka se knjiži sama.',
        href: '/orders',
        linkLabel: 'Otvori Narudžbe',
        permission: 'order.read',
      },
      {
        goal: 'Izdaj konačnu fakturu nakon isporuke',
        click: 'Na isporučenoj narudžbi klikni Isporuka → Konačna faktura.',
        expect: 'Treba da vidiš fakturu u kojoj je iznos već umanjen za plaćeni avans.',
        href: '/orders',
        linkLabel: 'Otvori Narudžbe',
        permission: 'order.read',
      },
      {
        goal: 'Evidentiraj uplatu',
        click: 'Klikni Finansije → otvori fakturu → evidentiraj uplatu.',
        expect: 'Treba da vidiš fakturu kao plaćenu i manje otvorenih potraživanja.',
        href: '/finance',
        linkLabel: 'Otvori Finansije',
        permission: 'finance.read',
      },
      {
        goal: 'Pregledaj PDV i KIF',
        click: 'Klikni PDV · KUF/KIF i izaberi period.',
        expect: 'Treba da vidiš avansne i konačne fakture u KIF-u i obračun PDV-a za period.',
        href: '/vat',
        linkLabel: 'Otvori PDV',
        permission: 'finance.ledger.read',
      },
    ],
  },
  {
    key: 'uprava',
    label: 'Uprava',
    defaultFor: 'analytics.read',
    intro: 'Brz pregled poslovanja, rokova i uključenih modula.',
    steps: [
      {
        goal: 'Pogledaj stanje dana',
        click: 'Klikni Kontrolna tabla i pogledaj karticu Uprava u dijelu Moj posao danas.',
        expect:
          'Treba da vidiš prihod ovog mjeseca, otvorene narudžbe, dobijene i izgubljene ponude.',
        href: '/',
        linkLabel: 'Otvori početnu',
        permission: 'analytics.read',
      },
      {
        goal: 'Analiziraj trendove',
        click: 'Klikni Analitika.',
        expect: 'Treba da vidiš ključne pokazatelje, najveće kupce i stanje proizvodnje.',
        href: '/analytics',
        linkLabel: 'Otvori Analitiku',
        permission: 'analytics.read',
      },
      {
        goal: 'Provjeri realan rok isporuke',
        click: 'Klikni Planiranje → Provjera roka isporuke i unesi artikl i količinu.',
        expect: 'Treba da vidiš najraniji datum koji proizvodnja i zalihe mogu ispuniti.',
        href: '/planning',
        linkLabel: 'Otvori Planiranje',
        permission: 'plan.read',
      },
      {
        goal: 'Uključi ili isključi module',
        click: 'Klikni Postavke → Moduli.',
        expect:
          'Treba da vidiš koji su moduli uključeni; isključeni nestaju iz menija svih korisnika.',
        href: '/settings',
        linkLabel: 'Otvori Postavke',
        permission: 'configuration.read',
      },
    ],
  },
];

export default function GuidePage() {
  const { can } = useApp();
  const [role, setRole] = useState<RoleKey>(
    () => GUIDES.find((g) => can(g.defaultFor))?.key ?? 'prodavac',
  );
  const tabRefs = useRef<Record<RoleKey, HTMLButtonElement | null>>({
    prodavac: null,
    proizvodnja: null,
    montaza: null,
    knjigovodstvo: null,
    uprava: null,
  });

  // A shared link such as /guide#montaza opens that role directly.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (GUIDES.some((g) => g.key === hash)) setRole(hash as RoleKey);
  }, []);

  const select = (key: RoleKey, focus = false) => {
    setRole(key);
    if (focus) tabRefs.current[key]?.focus();
    try {
      window.history.replaceState(null, '', `#${key}`);
    } catch {
      // Hash is a convenience only.
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = GUIDES[(index + delta + GUIDES.length) % GUIDES.length];
    if (next) select(next.key, true);
  };

  const guide = GUIDES.find((g) => g.key === role) ?? GUIDES[0]!;

  return (
    <main className="page">
      <h1>Vodič</h1>
      <p className="page-sub">
        Korak po korak kroz posao proizvodnje i montaže po mjeri: od upita kupca do plaćene fakture.
        Izaberite svoju ulogu.
      </p>

      <div className="grid-2" style={{ marginBottom: 8 }}>
        <section className="card" aria-labelledby="guide-before">
          <h2 id="guide-before">Prije početka</h2>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>Prijavite se svojim korisničkim imenom — svako radi pod svojim nalogom.</li>
            <li>Administrator vam dodjeljuje ulogu; ona određuje koje menije i dugmad vidite.</li>
            <li>
              Meni je lijevo (na telefonu i tabletu otvara se dugmetom ☰ gore lijevo). Pretraga
              menija brzo pronalazi svaki ekran.
            </li>
          </ul>
        </section>
        <section className="card" aria-labelledby="guide-missing">
          <h2 id="guide-missing">Ako nešto ne vidiš</h2>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>
              <strong>Nedostaje dozvola</strong> — vaša uloga nema pravo na taj ekran ili dugme.
            </li>
            <li>
              <strong>Modul je isključen</strong> — firma ga nije uključila u Postavkama.
            </li>
            <li>
              U oba slučaja javite se administratoru i recite koji korak iz vodiča ne možete
              uraditi.
            </li>
          </ul>
        </section>
      </div>

      <div className="row" role="tablist" aria-label="Uloga" style={{ marginBottom: 16 }}>
        {GUIDES.map((g, index) => (
          <button
            key={g.key}
            ref={(el) => {
              tabRefs.current[g.key] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${g.key}`}
            aria-selected={role === g.key}
            aria-controls={`panel-${g.key}`}
            tabIndex={role === g.key ? 0 : -1}
            className={role === g.key ? 'btn btn-primary' : 'btn'}
            onClick={() => select(g.key)}
            onKeyDown={(e) => onTabKey(e, index)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <section
        className="card"
        role="tabpanel"
        id={`panel-${guide.key}`}
        aria-labelledby={`tab-${guide.key}`}
      >
        <h2 style={{ marginTop: 0 }}>{guide.label}</h2>
        <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>
          {guide.intro}
        </p>
        <ol className="guide-steps">
          {guide.steps.map((step, i) => {
            const allowed = can(step.permission);
            return (
              <li key={`${guide.key}-${i}`} className="guide-step">
                <span className="guide-step-no" aria-hidden>
                  {i + 1}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    Korak {i + 1} — {step.goal}.
                  </div>
                  <div>{step.click}</div>
                  <div className="muted" style={{ marginTop: 2 }}>
                    {step.expect}
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    {allowed ? (
                      <Link href={step.href} className="btn btn-sm">
                        {step.linkLabel} →
                      </Link>
                    ) : (
                      <span className="badge badge-warn">
                        Nemate dozvolu za ovaj ekran — obratite se administratoru
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
