// Henter faktiske VM-2026-resultater fra API-Football og skriver dem til Supabase.
// Kjøres av GitHub Actions på timeplan (se .github/workflows/sync.yml).
// Ett HTTP-kall per kjøring (alle 104 kamper), så det holder seg godt under gratisgrensen.

import { createClient } from "@supabase/supabase-js";

const { APISPORTS_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!APISPORTS_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Mangler env: APISPORTS_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// pick_id = indeks. [LAG 1 (hjemme), LAG 2 (borte)] — samme rekkefølge som i index.html.
const PICKS = [
  ["Mexico","Sør-Afrika"],["Sør-Korea","Tsjekkia"],["Canada","Bosnia-Hercegovina"],
  ["USA","Paraguay"],["Brasil","Marokko"],["Haiti","Skottland"],["Nederland","Japan"],
  ["Elfenbenskysten","Ecuador"],["Sverige","Tunisia"],["Belgia","Egypt"],
  ["Iran","New Zealand"],["Frankrike","Senegal"],["Irak","Norge"],["Argentina","Algerie"],
  ["England","Kroatia"],["Ghana","Panama"],["Usbekistan","Colombia"],["Sveits","Bosnia-Hercegovina"],
  ["Mexico","Sør-Korea"],["USA","Australia"],["Skottland","Marokko"],["Tyrkia","Paraguay"],
  ["Nederland","Sverige"],["Tyskland","Elfenbenskysten"],["Ecuador","Curacao"],["Spania","Saudi-Arabia"],
  ["Belgia","Iran"],["New Zealand","Egypt"],["Argentina","Østerrike"],["Frankrike","Irak"],
  ["Norge","Senegal"],["Jordan","Algerie"],["England","Ghana"],["Colombia","DR Kongo"],
  ["Bosnia-Hercegovina","Qatar"],["Sveits","Canada"],["Skottland","Brasil"],["Tsjekkia","Mexico"],
  ["Curacao","Elfenbenskysten"],["Ecuador","Tyskland"],["Japan","Sverige"],["Tyrkia","USA"],
  ["Norge","Frankrike"],["Senegal","Irak"],["Kapp Verde","Saudi-Arabia"],["Uruguay","Spania"],
  ["Egypt","Iran"],["Kroatia","Ghana"],["Colombia","Portugal"],["DR Kongo","Usbekistan"],
];

// Norsk -> mulige engelske navn i API-Football. Sjekk Actions-loggen for "ikke matchet"
// og legg til/juster aliaser her hvis et lag ikke treffer.
const TEAM_MAP = {
  "Algerie":["Algeria"], "Argentina":["Argentina"], "Australia":["Australia"],
  "Belgia":["Belgium"], "Bosnia-Hercegovina":["Bosnia and Herzegovina","Bosnia & Herzegovina","Bosnia"],
  "Brasil":["Brazil"], "Canada":["Canada"], "Colombia":["Colombia"],
  "Curacao":["Curacao","Curaçao"], "DR Kongo":["Congo DR","DR Congo","Democratic Republic of Congo"],
  "Ecuador":["Ecuador"], "Egypt":["Egypt"], "Elfenbenskysten":["Ivory Coast","Cote d'Ivoire","Côte d'Ivoire"],
  "England":["England"], "Frankrike":["France"], "Ghana":["Ghana"], "Haiti":["Haiti"],
  "Irak":["Iraq"], "Iran":["Iran"], "Japan":["Japan"], "Jordan":["Jordan"],
  "Kapp Verde":["Cape Verde Islands","Cape Verde","Cabo Verde"], "Kroatia":["Croatia"],
  "Marokko":["Morocco"], "Mexico":["Mexico"], "Nederland":["Netherlands","Holland"],
  "New Zealand":["New Zealand"], "Norge":["Norway"], "Panama":["Panama"], "Paraguay":["Paraguay"],
  "Portugal":["Portugal"], "Qatar":["Qatar"], "Saudi-Arabia":["Saudi Arabia"], "Senegal":["Senegal"],
  "Skottland":["Scotland"], "Spania":["Spain"], "Sveits":["Switzerland"], "Sverige":["Sweden"],
  "Sør-Afrika":["South Africa"], "Sør-Korea":["South Korea","Korea Republic","Korea South"],
  "Tsjekkia":["Czech Republic","Czechia"], "Tunisia":["Tunisia"], "Tyrkia":["Turkey","Turkiye","Türkiye"],
  "Tyskland":["Germany"], "Uruguay":["Uruguay"], "USA":["USA","United States"],
  "Usbekistan":["Uzbekistan"], "Østerrike":["Austria"],
};

const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]/g,"");
const aliasSet = no => new Set((TEAM_MAP[no] || [no]).map(norm));
const sameTeam = (no, fixName) => aliasSet(no).has(norm(fixName));

async function main(){
  const url = "https://v3.football.api-sports.io/fixtures?league=1&season=2026";
  const r = await fetch(url, { headers: { "x-apisports-key": APISPORTS_KEY } });
  const json = await r.json();

  if (json.errors && (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors).length)) {
    console.error("API-Football feil:", JSON.stringify(json.errors));
    process.exit(1);
  }
  const fixtures = json.response || [];
  console.log(`Hentet ${fixtures.length} kamper fra API-Football.`);

  const rows = [], misses = [];
  for (let id = 0; id < PICKS.length; id++) {
    const [home, away] = PICKS[id];
    let f = null, swapped = false;
    for (const x of fixtures) {
      const fh = x.teams.home.name, fa = x.teams.away.name;
      if (sameTeam(home, fh) && sameTeam(away, fa)) { f = x; break; }
      if (sameTeam(home, fa) && sameTeam(away, fh)) { f = x; swapped = true; break; }
    }
    if (!f) { misses.push(`#${id} ${home}–${away}`); continue; }

    const status = f.fixture.status.short;
    let gh = f.goals.home, ga = f.goals.away;
    if (gh == null || ga == null) {
      rows.push({ pick_id: id, goals_home: null, goals_away: null, outcome: null, status });
      continue;
    }
    // Orienter mot din rekkefølge (LAG 1 = hjemme)
    const hg = swapped ? ga : gh;
    const ag = swapped ? gh : ga;
    const outcome = hg > ag ? "H" : hg < ag ? "B" : "U";
    rows.push({ pick_id: id, goals_home: hg, goals_away: ag, outcome, status,
                updated_at: new Date().toISOString() });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error } = await db.from("results").upsert(rows, { onConflict: "pick_id" });
  if (error) { console.error("Supabase-feil:", error.message); process.exit(1); }

  const played = rows.filter(x => x.outcome).length;
  console.log(`Skrev ${rows.length} rader (${played} med resultat).`);
  if (misses.length) console.log("Ikke matchet (juster TEAM_MAP eller ikke spilt ennå):\n  " + misses.join("\n  "));
}

main().catch(e => { console.error(e); process.exit(1); });
