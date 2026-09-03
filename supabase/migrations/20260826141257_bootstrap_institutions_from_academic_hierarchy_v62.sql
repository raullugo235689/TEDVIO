-- Recovered from the production migration ledger for deterministic rebuilds.
with src as (
  select distinct on (lower(trim(name))) teacher_id, trim(name) as name
  from public.v2_universities
  where nullif(trim(name),'') is not null
  order by lower(trim(name)), created_at
), ins as (
  insert into public.tedvio_institutions(name,slug,status,plan,seat_limit,created_by)
  select s.name,
         trim(both '-' from regexp_replace(lower(translate(s.name,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),'[^a-z0-9]+','-','g')) || '-' || substr(md5(lower(s.name)),1,6),
         'active','institutional',500,s.teacher_id
  from src s
  on conflict(slug) do nothing
  returning id,name
)
insert into public.tedvio_institution_memberships(institution_id,user_id,member_role,status)
select i.id,u.teacher_id,'institution_admin','active'
from public.v2_universities u
join public.tedvio_institutions i on lower(i.name)=lower(trim(u.name))
where nullif(trim(u.name),'') is not null
on conflict(institution_id,user_id) do update set member_role='institution_admin',status='active',updated_at=now();

