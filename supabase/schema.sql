create extension if not exists "uuid-ossp";

create table if not exists games (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  host_name text not null,
  prompt text not null,
  criteria text not null,
  draw_time_secs int not null default 180,
  status text not null default 'lobby', -- lobby | drawing | waiting | judging | results
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

-- Enable realtime
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;
