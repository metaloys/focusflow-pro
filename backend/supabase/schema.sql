-- FocusKit Supabase schema
-- Requires: pgcrypto (for gen_random_uuid)
create extension if not exists pgcrypto;

-- Users profile, one row per auth user
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pomodoro_focus_minutes int not null default 25,
  pomodoro_break_minutes int not null default 5,
  long_break_minutes int not null default 15,
  sessions_before_long int not null default 4,
  theme text not null default 'system',
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  priority int not null default 3, -- 1 urgent, 2 high, 3 normal, 4 low
  status text not null default 'todo', -- todo | doing | done | archived
  due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists tasks_status_idx on public.tasks(status);

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  session_type text not null default 'pomodoro', -- pomodoro | custom
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int, -- nullable until session ends
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists focus_sessions_user_id_idx on public.focus_sessions(user_id);
create index if not exists focus_sessions_started_at_idx on public.focus_sessions(started_at);

create table if not exists public.blocklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists blocklists_user_id_idx on public.blocklists(user_id);

create table if not exists public.blocklist_items (
  id uuid primary key default gen_random_uuid(),
  blocklist_id uuid not null references public.blocklists(id) on delete cascade,
  pattern text not null, -- domain or wildcard pattern
  created_at timestamptz not null default now()
);
create index if not exists blocklist_items_blocklist_id_idx on public.blocklist_items(blocklist_id);

-- Triggers for updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_user_settings on public.user_settings;
create trigger set_updated_at_user_settings
before update on public.user_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_tasks on public.tasks;
create trigger set_updated_at_tasks
before update on public.tasks
for each row execute function public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.tasks enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.blocklists enable row level security;
alter table public.blocklist_items enable row level security;

-- Profiles: user can see/update own row
create policy profiles_select_self on public.profiles for select using (id = auth.uid());
create policy profiles_insert_self on public.profiles for insert with check (id = auth.uid());
create policy profiles_update_self on public.profiles for update using (id = auth.uid());

-- User settings: user can manage own
create policy user_settings_select_self on public.user_settings for select using (user_id = auth.uid());
create policy user_settings_upsert_self on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tasks: per-user ownership
create policy tasks_select_own on public.tasks for select using (user_id = auth.uid());
create policy tasks_crud_own on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Focus sessions: per-user ownership
create policy focus_sessions_select_own on public.focus_sessions for select using (user_id = auth.uid());
create policy focus_sessions_crud_own on public.focus_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Blocklists and items: per-user ownership
create policy blocklists_select_own on public.blocklists for select using (user_id = auth.uid());
create policy blocklists_crud_own on public.blocklists for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy blocklist_items_select_by_owner on public.blocklist_items for select using (
  exists (
    select 1 from public.blocklists b where b.id = blocklist_id and b.user_id = auth.uid()
  )
);
create policy blocklist_items_crud_by_owner on public.blocklist_items for all using (
  exists (
    select 1 from public.blocklists b where b.id = blocklist_id and b.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.blocklists b where b.id = blocklist_id and b.user_id = auth.uid()
  )
);

-- Helpful defaults via RPC or on first login (to be set from app)
-- insert into public.blocklists(user_id, name, is_default) values (auth.uid(), 'Default', true);