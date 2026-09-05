# NexoraOS — Brzi start (bosanski)

Cijela platforma se podiže na tvoj vlastiti server jednom komandom.
Ništa ne ide na javne platforme: baza, aplikacija i fajlovi ostaju kod tebe.

## 1. Kupi server (VPS)

Preporuka: **Hetzner CX22** (2 vCPU, 4 GB RAM, ~5 €/mjesečno) sa
**Ubuntu 24.04**. Bilo koji sličan VPS radi. Pri kupovini dobiješ
IP adresu servera — trebat će ti u sljedećem koraku.

## 2. Usmjeri domenu

U DNS panelu svog registrara (npr. Globalhost → cPanel → Zone Editor za
`xcall.ba`) dodaj **A zapis**:

| Tip | Ime      | Vrijednost        |
| --- | -------- | ----------------- |
| A   | `nexora` | IP adresa servera |

Za par minuta `nexora.xcall.ba` pokazuje na tvoj server.

## 3. Instaliraj jednom komandom

Spoji se na server (`ssh root@IP-ADRESA`) i zalijepi:

```sh
curl -fsSL https://raw.githubusercontent.com/kenanbuss-sys/nexora/main/deploy/install.sh | sudo bash
```

Skripta instalira Docker, kloni kod, pita te samo za domenu
(ukucaj `nexora.xcall.ba`), sama generiše lozinke baze i tajne
(spremljene u `deploy/.env` na serveru, nigdje drugo), podigne cijeli
sistem sa automatskim HTTPS certifikatom i ponudi demo podatke.

## 4. Prva prijava

Otvori `https://nexora.xcall.ba` → **Sign in with password**:

- Tenant: `demo`
- Email: `admin@demo.example`
- Lozinka: `nexora-demo`

Odmah nakon prijave:

1. **Promijeni lozinku** (Users → Two-factor authentication kartica je
   odmah ispod; promjena lozinke ide kroz `change-password`).
2. **Uključi 2FA** (Users → Two-factor authentication → Enable MFA,
   skeniraj tajnu u Google Authenticator, potvrdi kodom).

## 5. Prilagodi platformu sebi

- **Settings → Branding**: naziv radnog prostora i boje — cijela
  aplikacija poprima tvoj brend.
- **Settings → Modules**: isključi module koje ne koristiš (nestaju i
  stranice i API).
- **Settings → Terminology**: preimenuj stavke menija po svom rječniku.
- **Settings → Approvals**: prag iznad kojeg nabavke idu na odobrenje.

## 6. Uvezi stvarne podatke

**Import/export** stranica: učitaj CSV fajlove redom —

1. proizvodi (`code,name,description`)
2. artikli (`productCode,code,name,baseUom,activate`)
3. kupci (`name,email,creditLimit`)
4. dobavljači (`name,email,leadTimeDays`)
5. početno stanje zaliha (`warehouseCode,skuCode,quantity`)

Isti fajl možeš pustiti više puta — postojeći redovi se preskaču,
ništa se ne duplira. Nakon uvoza otvori **Parties → Data quality** da
vidiš šta nedostaje (e-mailovi, barkodovi, teritorije…).

## 7. Održavanje

- **Ažuriranje**: na serveru `cd /opt/nexora && git pull && docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build`
- **Backup baze**: `docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T db pg_dump -U app enterprise_os > backup-$(date +%F).sql`
- Detalji na engleskom: [SELF_HOSTING.md](./SELF_HOSTING.md)
