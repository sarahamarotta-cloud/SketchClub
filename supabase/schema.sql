create extension if not exists "uuid-ossp";

create table if not exists games (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  host_name text not null,
  prompt text not null,
  criteria text not null,
  draw_time_secs int not null default 180,
  status text not null default 'lobby',
  created_at timestamptz default now()
);

create table if not exists players (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid references games(id) on delete cascade,
  name text not null,
  is_host boolean default false,
  drawing_url text,
  points int default 0,
  roast text,
  submitted_at timestamptz,
  joined_at timestamptz default now()
);

-- Enable RLS
alter table games enable row level security;
alter table players enable row level security;

-- Games: anyone can read/insert/update (no auth required for this game)
create policy "games_select" on games for select using (true);
create policy "games_insert" on games for insert with check (true);
create policy "games_update" on games for update using (true);

-- Players: anyone can read/insert/update
create policy "players_select" on players for select using (true);
create policy "players_insert" on players for insert with check (true);
create policy "players_update" on players for update using (true);

-- Enable realtime
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;
