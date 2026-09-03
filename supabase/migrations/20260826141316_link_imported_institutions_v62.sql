-- Recovered from the production migration ledger for deterministic rebuilds.
insert into public.tedvio_institution_memberships(institution_id,user_id,member_role,status)
select distinct i.id,u.teacher_id,'institution_admin','active'
from public.v2_universities u
join public.tedvio_institutions i on lower(i.name)=lower(trim(u.name))
where nullif(trim(u.name),'') is not null
on conflict(institution_id,user_id) do update set member_role='institution_admin',status='active',updated_at=now();

