-- Run these in Supabase SQL editor
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text,
  description text,
  image_data text,
  box jsonb,
  status text,
  updated_at timestamptz default now()
);

create table if not exists study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  mistakes jsonb,
  training_index int,
  updated_at timestamptz default now()
);

alter table cards enable row level security;
alter table study_sessions enable row level security;

create policy "cards_select_own" on cards
  for select using (auth.uid() = user_id);
create policy "cards_insert_own" on cards
  for insert with check (auth.uid() = user_id);
create policy "cards_update_own" on cards
  for update using (auth.uid() = user_id);
create policy "cards_delete_own" on cards
  for delete using (auth.uid() = user_id);

create policy "study_select_own" on study_sessions
  for select using (auth.uid() = user_id);
create policy "study_insert_own" on study_sessions
  for insert with check (auth.uid() = user_id);
create policy "study_update_own" on study_sessions
  for update using (auth.uid() = user_id);
create policy "study_delete_own" on study_sessions
  for delete using (auth.uid() = user_id);
