# VM 2026 — Live tippetracker (GitHub Actions + Supabase)

En selvoppdaterende versjon av tippekupong-trackeren. GitHub Actions henter
faktiske VM-resultater fra API-Football på timeplan og skriver dem til Supabase.
Nettsiden (`index.html`) leser fra Supabase, så den viser ferske resultater
**uansett om du har den åpen eller ikke** — oppdateringen skjer på serversiden.

```
API-Football  ──(hvert 20. min)──►  GitHub Actions  ──►  Supabase (results)
                                                              │
                                              index.html ◄────┘  (leser hvert minutt)
```

Tippingen din er fast og ligger i `index.html`. Bonus-spørsmål (øvrige + ja/nei)
fyller du inn selv; de lagres lokalt i nettleseren din. Bare kampresultatene
hentes automatisk.

---

## 1. Supabase

1. Lag et gratis prosjekt på [supabase.com](https://supabase.com).
2. Åpne **SQL Editor**, lim inn innholdet i `db/schema.sql` og kjør det.
3. Gå til **Project Settings → API** og noter:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** key (trygg i frontend)
   - **service_role** key (hemmelig — kun til GitHub Actions, aldri i frontend)

## 2. API-Football-nøkkel

1. Lag gratis konto på [api-sports.io](https://api-sports.io) (eller via RapidAPI).
2. Kopier API-nøkkelen. Gratisplanen gir ~100 kall/dag — nok, siden vi bruker
   ett kall hvert 20. minutt.
3. VM 2026 ligger som `league=1`, `season=2026` (alle 104 kamper).

## 3. Push repoet til GitHub

```bash
git init && git add . && git commit -m "VM 2026 tracker"
git branch -M main
git remote add origin git@github.com:<bruker>/vm2026-tracker.git
git push -u origin main
```

## 4. Legg inn hemmeligheter (GitHub Secrets)

I repoet: **Settings → Secrets and variables → Actions → New repository secret**.
Legg inn tre stykker:

| Navn | Verdi |
|------|-------|
| `APISPORTS_KEY` | API-Football-nøkkelen |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role-nøkkelen |

## 5. Test synkingen

Gå til **Actions → Sync VM-resultater → Run workflow** for å kjøre manuelt.
Sjekk loggen: den skal si hvor mange kamper den hentet og skrev. Åpne så
`results`-tabellen i Supabase og se at den fylles. Deretter går cron-jobben
av seg selv hvert 20. minutt.

Hvis loggen lister kamper under **"Ikke matchet"** som faktisk er spilt, er det
som regel et lagnavn som ikke stemmer med API-et — juster `TEAM_MAP` i
`scripts/sync.mjs` og push på nytt.

## 6. Frontend

Åpne `index.html` og fyll inn øverst:

```js
const SUPABASE_URL  = "https://xxxx.supabase.co";
const SUPABASE_ANON = "<anon public key>";
```

Publiser via **GitHub Pages** (Settings → Pages → Deploy from branch → `main` / root),
eller bare åpne fila lokalt. Siden leser fra basen ved oppstart og hvert minutt,
og hver gang du bytter tilbake til fanen.

---

## Bra å vite

- **Manuell overstyring.** Trykker du på et H/U/B-tegn, overstyrer du live-feeden
  for den kampen (merkes «DIN»). Trykk samme tegn igjen for å gå tilbake til
  automatisk. Nyttig hvis et resultat henger eller BDOs fasit avviker.
- **Live vs. ferdig.** Kamper som spilles akkurat nå merkes «● LIVE» og oppdateres
  fortløpende; ferdigspilte står som vanlig.
- **Rate-grense.** Ett API-kall per kjøring. `*/20` = ~72 kall/dag. Vil du polle
  oftere under kampkvelder, endre cron i `.github/workflows/sync.yml`, men hold
  deg under 100/dag på gratisplanen.
- **Cron er UTC.** GitHub (som Vercel) kjører cron i UTC, og planlagte jobber kan
  bli noen minutter forsinket ved last.
- **Sikkerhet.** service_role-nøkkelen gir full skrivetilgang og skal *kun* ligge
  som GitHub Secret. anon-nøkkelen i frontend er trygg fordi `results` kun har
  lese-policy (RLS).
- **Kuratert kupong.** Noen rader i kupongen din er ikke faktiske VM-kamper og vil
  aldri matche i API-et — de står tomme til du evt. fyller dem inn manuelt.
- **Bonus-kategoriene** (toppscorer, Norges plassering, måldueller) er manuelle nå.
  De kan på sikt auto-fylles fra API-Footballs `top_scorers`- og `standings`-
  endepunkter hvis du vil utvide `sync.mjs`.

## Filer

```
index.html                     frontend (GitHub Pages)
db/schema.sql                  Supabase-tabell + RLS
scripts/sync.mjs               henter resultater -> Supabase
package.json                   avhengighet for sync
.github/workflows/sync.yml     timeplan for synkingen
```
