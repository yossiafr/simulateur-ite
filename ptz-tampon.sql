-- Attestation éco-PTZ : tampon et signature de l'entreprise, lisibles et modifiables par les administrateurs seulement.
-- À exécuter une fois dans Supabase > SQL Editor.
create table if not exists public.ite_admin_docs (
  id text primary key,
  data text not null,
  updated_at timestamptz not null default now()
);
alter table public.ite_admin_docs enable row level security;
drop policy if exists ite_admin_docs_admin on public.ite_admin_docs;
create policy ite_admin_docs_admin on public.ite_admin_docs for all
  using (public.ite_is_admin()) with check (public.ite_is_admin());
grant select, insert, update, delete on public.ite_admin_docs to authenticated;
