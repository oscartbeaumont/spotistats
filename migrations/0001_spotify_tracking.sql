create table if not exists spotify_tracking_users (
  spotify_user_id text primary key,
  display_name text,
  email text,
  enabled integer not null default 1,
  consented_at integer not null,
  disabled_at integer,
  created_at integer not null,
  updated_at integer not null
);

create table if not exists spotify_tokens (
  spotify_user_id text primary key references spotify_tracking_users(spotify_user_id) on delete cascade,
  refresh_token text not null,
  scope text not null,
  updated_at integer not null
);

create table if not exists spotify_sync_state (
  spotify_user_id text primary key references spotify_tracking_users(spotify_user_id) on delete cascade,
  last_played_at_ms integer,
  last_success_at integer,
  last_error text,
  next_sync_after integer not null default 0,
  updated_at integer not null
);

create table if not exists spotify_tracks (
  spotify_track_id text primary key,
  name text not null,
  album_name text,
  artist_names text,
  duration_ms integer,
  uri text,
  external_url text,
  image_url text,
  raw_json text,
  updated_at integer not null
);

create table if not exists spotify_listens (
  id text primary key,
  spotify_user_id text not null references spotify_tracking_users(spotify_user_id) on delete cascade,
  spotify_track_id text not null references spotify_tracks(spotify_track_id),
  played_at text not null,
  played_at_ms integer not null,
  context_type text,
  context_uri text,
  raw_json text,
  created_at integer not null,
  unique (spotify_user_id, spotify_track_id, played_at_ms)
);

create index if not exists idx_spotify_tracking_users_due
  on spotify_tracking_users(enabled, spotify_user_id);

create index if not exists idx_spotify_sync_state_due
  on spotify_sync_state(next_sync_after);

create index if not exists idx_spotify_listens_recent
  on spotify_listens(spotify_user_id, played_at_ms desc);
