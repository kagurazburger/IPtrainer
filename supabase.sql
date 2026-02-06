-- Run these in Supabase SQL editor
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  card_uid text,
  user_id uuid references auth.users on delete cascade,
  group_id uuid,
  name text,
  description text,
  image_data text,
  box jsonb,
  status text,
  updated_at timestamptz default now()
);

create table if not exists card_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text,
  created_at timestamptz default now()
);

create table if not exists study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  group_id uuid,
  mistakes jsonb,
  training_index int,
  updated_at timestamptz default now()
);

alter table cards add column if not exists card_uid text;
alter table cards add column if not exists group_id uuid;
alter table study_sessions add column if not exists group_id uuid;

create unique index if not exists cards_user_uid_unique on cards (user_id, card_uid);

alter table cards enable row level security;
alter table card_groups enable row level security;
alter table study_sessions enable row level security;

drop policy if exists "cards_select_own" on cards;
drop policy if exists "cards_insert_own" on cards;
drop policy if exists "cards_update_own" on cards;
drop policy if exists "cards_delete_own" on cards;

drop policy if exists "groups_select_own" on card_groups;
drop policy if exists "groups_insert_own" on card_groups;
drop policy if exists "groups_update_own" on card_groups;
drop policy if exists "groups_delete_own" on card_groups;

drop policy if exists "study_select_own" on study_sessions;
drop policy if exists "study_insert_own" on study_sessions;
drop policy if exists "study_update_own" on study_sessions;
drop policy if exists "study_delete_own" on study_sessions;

create policy "cards_select_own" on cards
  for select using (auth.uid() = user_id);
create policy "cards_insert_own" on cards
  for insert with check (auth.uid() = user_id);
create policy "cards_update_own" on cards
  for update using (auth.uid() = user_id);
create policy "cards_delete_own" on cards
  for delete using (auth.uid() = user_id);

create policy "groups_select_own" on card_groups
  for select using (auth.uid() = user_id);
create policy "groups_insert_own" on card_groups
  for insert with check (auth.uid() = user_id);
create policy "groups_update_own" on card_groups
  for update using (auth.uid() = user_id);
create policy "groups_delete_own" on card_groups
  for delete using (auth.uid() = user_id);

create policy "study_select_own" on study_sessions
  for select using (auth.uid() = user_id);
create policy "study_insert_own" on study_sessions
  for insert with check (auth.uid() = user_id);
create policy "study_update_own" on study_sessions
  for update using (auth.uid() = user_id);
create policy "study_delete_own" on study_sessions
  for delete using (auth.uid() = user_id);
