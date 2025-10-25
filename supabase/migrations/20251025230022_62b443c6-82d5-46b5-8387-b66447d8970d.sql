-- Fix unique constraint to allow same name for inactive people
-- Drop the existing unique constraint
alter table public.people drop constraint if exists people_name_key;

-- Add partial unique constraint - only enforce uniqueness for active people
create unique index if not exists people_name_active_key 
  on public.people(name) 
  where is_active = true;

-- Update v_person_financials to only show active people
drop view if exists public.v_global_receivable;
drop view if exists public.v_person_financials;

create view public.v_person_financials as
select
  p.id, p.name, p.price_per_cig, p.is_active, p.created_at,
  coalesce(sum(case when e.is_deleted = false then e.delta else 0 end), 0)::int as cig_count,
  coalesce(p.price_per_cig, s.default_price) as eff_price_per_cig,
  (
    coalesce(sum(case when e.is_deleted = false then e.delta else 0 end), 0)
    * coalesce(p.price_per_cig, s.default_price)
  )::numeric(12,2) as cig_total,
  (
    select coalesce(sum(l.amount),0)::numeric(12,2)
    from public.loans l
    where l.person_id = p.id and l.is_deleted = false
  ) as loans_total,
  (
    (
      coalesce(sum(case when e.is_deleted = false then e.delta else 0 end), 0)
      * coalesce(p.price_per_cig, s.default_price)
    )
    +
    (
      select coalesce(sum(l.amount),0)
      from public.loans l
      where l.person_id = p.id and l.is_deleted = false
    )
  )::numeric(12,2) as grand_total
from public.people p
left join public.events e on e.person_id = p.id
cross join lateral (select default_price from public.settings where id = 'global') s
where p.is_active = true
group by p.id, s.default_price;

create or replace view public.v_global_receivable as
select coalesce(sum(grand_total), 0)::numeric(14,2) as total_receivable
from public.v_person_financials;