-- ABA Practice Platform — core schema
-- Design rules:
--  * Every PHI table carries org_id and is protected by RLS keyed on the signed-in user's org.
--  * session_events is APPEND-ONLY and client-ID'd (uuid generated on the device) so offline sync is idempotent.
--  * Every write to a PHI table lands in audit_log via trigger. Signed notes are immutable.
--  * Claims are DERIVED from co-signed notes, never typed by hand.

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type staff_role as enum ('owner', 'bcba', 'bcaba', 'rbt', 'biller');
create type data_type as enum ('trial', 'frequency', 'duration', 'task_analysis');
create type target_phase as enum ('baseline', 'intervention', 'maintenance', 'mastered', 'on_hold');
create type payer_type as enum ('commercial', 'private_pay', 'medicaid');
create type session_status as enum ('scheduled', 'in_progress', 'ended', 'cancelled', 'no_show');
create type note_status as enum ('draft', 'signed', 'cosigned', 'returned');
create type claim_status as enum ('pending_note', 'ready', 'submitted', 'paid', 'denied', 'void');

-- ---------- tenancy ----------
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  npi text,
  tax_id_last4 text,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references orgs(id),
  role staff_role not null default 'rbt',
  full_name text not null,
  credential text,              -- 'BCBA', 'RBT', ...
  npi text,
  cert_expires_on date,
  created_at timestamptz not null default now()
);
create index on profiles(org_id);

create or replace function current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function current_role_is(roles staff_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = any(roles))
$$;

-- ---------- clients ----------
create table payers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  name text not null,
  type payer_type not null,
  payer_id text,                -- clearinghouse payer id
  created_at timestamptz not null default now()
);
create index on payers(org_id);

create table clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  first_name text not null,
  last_name text not null,
  dob date not null,
  diagnosis_code text,          -- e.g. F84.0
  lead_bcba_id uuid references profiles(id),
  payer_id uuid references payers(id),
  member_id text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index on clients(org_id);

create table guardians (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  full_name text not null,
  relation text,
  phone text,
  email text
);

create table authorizations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  client_id uuid not null references clients(id) on delete cascade,
  payer_id uuid references payers(id),
  cpt_code text not null,       -- 97153, 97155, 97156, 97151
  units_authorized int not null,
  starts_on date not null,
  ends_on date not null,
  auth_number text,
  created_at timestamptz not null default now()
);
create index on authorizations(client_id);

-- ---------- clinical ----------
create table programs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  domain text,                  -- Listener, Tact, Self-care, Behavior reduction...
  goal_text text,
  source text,                  -- VB-MAPP, ABLLS-R, AFLS, PEAK, EFL, custom
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index on programs(client_id);

create table targets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  program_id uuid not null references programs(id) on delete cascade,
  name text not null,
  data_type data_type not null,
  sd text,                      -- discriminative stimulus / instruction
  prompt_levels text[] not null default array['Gestural','Verbal','Model','Physical'],
  steps text[],                 -- task analysis steps
  mastery jsonb not null default '{"pct":80,"sessions":3,"min_trials":5}',
  phase target_phase not null default 'intervention',
  phase_changes jsonb not null default '[]',   -- [{at, from, to, note}]
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on targets(program_id);

-- ---------- scheduling & sessions ----------
create table appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  client_id uuid not null references clients(id) on delete cascade,
  staff_id uuid not null references profiles(id),
  cpt_code text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  place_of_service text not null default '12',   -- 12 home, 11 office, 02/10 telehealth
  status session_status not null default 'scheduled',
  created_at timestamptz not null default now()
);
create index on appointments(org_id, starts_at);

create table sessions (
  id uuid primary key,          -- generated on device
  org_id uuid not null references orgs(id),
  appointment_id uuid references appointments(id),
  client_id uuid not null references clients(id),
  staff_id uuid not null references profiles(id),
  cpt_code text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  place_of_service text not null default '12',
  caregiver_present boolean,
  start_lat double precision, start_lng double precision,
  end_lat double precision, end_lng double precision,
  device_id text,
  status session_status not null default 'in_progress',
  created_at timestamptz not null default now()
);
create index on sessions(client_id, started_at desc);
create index on sessions(staff_id, started_at desc);

-- Append-only event log. One row per tap. Never updated, never deleted.
create table session_events (
  id uuid primary key,          -- generated on device => idempotent upsert
  org_id uuid not null references orgs(id),
  session_id uuid not null references sessions(id) on delete cascade,
  target_id uuid references targets(id),
  kind text not null,           -- trial_independent | trial_prompted | trial_incorrect | count | episode_start | episode_end | ta_step | note
  payload jsonb not null default '{}',   -- {prompt_level}, {step_index, result}, {text}
  recorded_at timestamptz not null,
  device_seq int not null,
  received_at timestamptz not null default now()
);
create index on session_events(session_id, device_seq);
create index on session_events(target_id, recorded_at desc);

create or replace function forbid_change() returns trigger language plpgsql as $$
begin raise exception 'session_events is append-only'; end $$;
create trigger session_events_immutable before update or delete on session_events
  for each row execute function forbid_change();

-- ---------- documentation ----------
create table notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  session_id uuid not null unique references sessions(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null default '',
  checklist jsonb not null default '{}',   -- {time_units:true, pos_caregiver:true, targets:false, behavior:false, response:false}
  status note_status not null default 'draft',
  signed_at timestamptz,
  cosigned_by uuid references profiles(id),
  cosigned_at timestamptz,
  return_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function notes_guard() returns trigger language plpgsql as $$
begin
  if old.status in ('signed','cosigned') and new.body <> old.body then
    raise exception 'a signed note cannot be edited; return it to draft with a reason';
  end if;
  if old.status = 'cosigned' and new.status <> 'cosigned' then
    raise exception 'a co-signed note is locked';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger notes_guard before update on notes for each row execute function notes_guard();

-- ---------- billing ----------
create table claim_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  session_id uuid not null unique references sessions(id),
  note_id uuid references notes(id),
  client_id uuid not null references clients(id),
  payer_id uuid references payers(id),
  authorization_id uuid references authorizations(id),
  date_of_service date not null,
  cpt_code text not null,
  modifiers text[] not null default '{}',
  units int not null,
  place_of_service text not null,
  rendering_provider_id uuid references profiles(id),
  status claim_status not null default 'pending_note',
  submitted_at timestamptz,
  clearinghouse_ref text,
  created_at timestamptz not null default now()
);
create index on claim_lines(org_id, status);

-- Units from minutes: 15-min units, CMS 8-minute rule (payer-configurable later)
create or replace function units_from_minutes(mins int) returns int language sql immutable as $$
  select case when mins < 8 then 0 else greatest(1, ((mins + 7) / 15)) end
$$;

-- When a note is co-signed, materialize the claim line.
create or replace function on_note_cosigned() returns trigger language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; c clients%rowtype; a authorizations%rowtype; mins int;
begin
  if new.status = 'cosigned' and (old.status is distinct from 'cosigned') then
    select * into s from sessions where id = new.session_id;
    select * into c from clients where id = s.client_id;
    mins := greatest(0, extract(epoch from (s.ended_at - s.started_at))/60)::int;
    select * into a from authorizations
      where client_id = s.client_id and cpt_code = s.cpt_code
        and s.started_at::date between starts_on and ends_on
      order by ends_on desc limit 1;
    insert into claim_lines (org_id, session_id, note_id, client_id, payer_id, authorization_id, date_of_service,
                             cpt_code, units, place_of_service, rendering_provider_id, status)
    values (s.org_id, s.id, new.id, s.client_id, c.payer_id, a.id, s.started_at::date,
            s.cpt_code, units_from_minutes(mins), s.place_of_service, s.staff_id, 'ready')
    on conflict (session_id) do update set note_id = excluded.note_id, units = excluded.units, status = 'ready';
  end if;
  return new;
end $$;
create trigger notes_to_claims after update on notes for each row execute function on_note_cosigned();

-- ---------- audit ----------
create table audit_log (
  id bigserial primary key,
  org_id uuid,
  actor_id uuid,
  action text not null,
  table_name text not null,
  row_id uuid,
  at timestamptz not null default now(),
  detail jsonb
);
create index on audit_log(org_id, at desc);

create or replace function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid; oid uuid;
begin
  if tg_op = 'DELETE' then rid := old.id; oid := old.org_id; else rid := new.id; oid := new.org_id; end if;
  insert into audit_log(org_id, actor_id, action, table_name, row_id, detail)
  values (oid, auth.uid(), tg_op, tg_table_name, rid,
          case when tg_op = 'UPDATE' then jsonb_build_object('changed', (select jsonb_object_agg(key, value) from jsonb_each(to_jsonb(new)) where to_jsonb(old)->key is distinct from value)) else null end);
  if tg_op = 'DELETE' then return old; end if; return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['clients','guardians','authorizations','programs','targets','appointments','sessions','session_events','notes','claim_lines'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on %1$s for each row execute function audit_row()', t);
  end loop; end $$;

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['orgs','profiles','payers','clients','guardians','authorizations','programs','targets','appointments','sessions','session_events','notes','claim_lines','audit_log'] loop
    execute format('alter table %I enable row level security', t);
  end loop; end $$;

create policy orgs_read on orgs for select using (id = current_org());
create policy profiles_read on profiles for select using (org_id = current_org());
create policy profiles_self_update on profiles for update using (id = auth.uid());
create policy profiles_admin on profiles for all using (org_id = current_org() and current_role_is(array['owner']::staff_role[]));

-- org-scoped tables: everyone in the org reads; writes per role
do $$ declare t text; begin
  foreach t in array array['payers','clients','authorizations','programs','targets','appointments'] loop
    execute format('create policy %1$s_read on %1$s for select using (org_id = current_org())', t);
    execute format('create policy %1$s_write on %1$s for all using (org_id = current_org() and current_role_is(array[''owner'',''bcba'',''bcaba'',''biller'']::staff_role[])) with check (org_id = current_org())', t);
  end loop; end $$;

create policy guardians_read on guardians for select using (exists (select 1 from clients c where c.id = client_id and c.org_id = current_org()));
create policy guardians_write on guardians for all using (exists (select 1 from clients c where c.id = client_id and c.org_id = current_org()) and current_role_is(array['owner','bcba','bcaba']::staff_role[]));

-- sessions & events: any staff in the org may create/read; RBTs only their own
create policy sessions_read on sessions for select using (org_id = current_org());
create policy sessions_insert on sessions for insert with check (org_id = current_org() and staff_id = auth.uid());
create policy sessions_update on sessions for update using (org_id = current_org() and (staff_id = auth.uid() or current_role_is(array['owner','bcba']::staff_role[])));
create policy events_read on session_events for select using (org_id = current_org());
create policy events_insert on session_events for insert with check (org_id = current_org());

create policy notes_read on notes for select using (org_id = current_org());
create policy notes_insert on notes for insert with check (org_id = current_org() and author_id = auth.uid());
create policy notes_update on notes for update using (org_id = current_org() and (author_id = auth.uid() or current_role_is(array['owner','bcba']::staff_role[])));

create policy claims_read on claim_lines for select using (org_id = current_org());
create policy claims_write on claim_lines for all using (org_id = current_org() and current_role_is(array['owner','biller']::staff_role[]));

create policy audit_read on audit_log for select using (org_id = current_org() and current_role_is(array['owner']::staff_role[]));

-- ---------- derived views ----------
create or replace view target_status as
select t.id as target_id, t.program_id, p.client_id, t.org_id,
       max(e.recorded_at) as last_data_at,
       (now() - max(e.recorded_at)) > interval '3 days' as stale
from targets t join programs p on p.id = t.program_id
left join session_events e on e.target_id = t.id
group by t.id, t.program_id, p.client_id, t.org_id;

create or replace view authorization_usage as
select a.id as authorization_id, a.client_id, a.org_id, a.cpt_code, a.units_authorized, a.starts_on, a.ends_on,
       coalesce(sum(cl.units) filter (where cl.status <> 'void'), 0)::int as units_used,
       (a.ends_on - current_date) as days_left
from authorizations a
left join claim_lines cl on cl.authorization_id = a.id
group by a.id;
