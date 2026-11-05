-- Files attached to client or staff profiles, stored in a private bucket keyed by org.
create table files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  owner_kind text not null check (owner_kind in ('client','staff')),
  owner_id uuid not null,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  mime text,
  category text not null default 'other',
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index files_owner on files(org_id, owner_kind, owner_id);
alter table files enable row level security;
create policy files_read on files for select using (org_id = current_org());
create policy files_insert on files for insert with check (org_id = current_org());
create policy files_delete on files for delete using (org_id = current_org() and (uploaded_by = auth.uid() or current_role_is(array['owner','bcba']::staff_role[])));
create trigger audit_files after insert or update or delete on files for each row execute function audit_row();
insert into storage.buckets (id, name, public, file_size_limit) values ('files','files', false, 26214400) on conflict (id) do nothing;
create policy files_bucket_read on storage.objects for select using (bucket_id = 'files' and (storage.foldername(name))[1] = current_org()::text);
create policy files_bucket_write on storage.objects for insert with check (bucket_id = 'files' and (storage.foldername(name))[1] = current_org()::text);
create policy files_bucket_delete on storage.objects for delete using (bucket_id = 'files' and (storage.foldername(name))[1] = current_org()::text);
