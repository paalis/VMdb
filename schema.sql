-- VM 2026 tracker — kjør denne én gang i Supabase (SQL Editor).
-- Eneste tabell vi trenger: fasit som GitHub Actions oppdaterer løpende.
-- Tippingen din ligger i frontend; bonus-svar lagres lokalt i nettleseren.

create table if not exists results (
  pick_id     int primary key,        -- 0–49, samme rekkefølge som kampene i index.html
  goals_home  int,                    -- mål for LAG 1 (din "hjemme")
  goals_away  int,                    -- mål for LAG 2
  outcome     char(1),                -- 'H' | 'U' | 'B' (utledet, sett i forhold til LAG 1)
  status      text,                   -- API-Football statuskode: 'NS','1H','HT','2H','FT', osv.
  updated_at  timestamptz default now()
);

-- Les for alle (anon-nøkkel i frontend), skriv kun via service-rollen (GitHub Actions).
alter table results enable row level security;

drop policy if exists "public read results" on results;
create policy "public read results"
  on results for select
  to anon
  using (true);
