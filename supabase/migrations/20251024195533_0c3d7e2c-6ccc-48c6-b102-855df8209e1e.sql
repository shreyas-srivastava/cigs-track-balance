-- Add soft delete to events for full delete support beyond "undo last"
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_events_person_recent 
  ON public.events(person_id, created_at DESC) 
  WHERE is_deleted = false;

-- Create loans table
CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loans_person_date 
  ON public.loans(person_id, loan_date DESC) 
  WHERE is_deleted = false;

-- Drop old view and create financial view with cigarettes + loans
DROP VIEW IF EXISTS public.v_person_totals;

CREATE VIEW public.v_person_financials AS
SELECT
  p.id,
  p.name,
  p.price_per_cig,
  p.is_active,
  p.created_at,
  -- cigarette count (ignoring soft-deleted events)
  COALESCE(SUM(CASE WHEN e.is_deleted = false THEN e.delta ELSE 0 END), 0)::INT AS cig_count,
  -- effective price
  COALESCE(p.price_per_cig, s.default_price) AS eff_price_per_cig,
  -- cigarette total
  (
    COALESCE(SUM(CASE WHEN e.is_deleted = false THEN e.delta ELSE 0 END), 0)
    * COALESCE(p.price_per_cig, s.default_price)
  )::NUMERIC(12,2) AS cig_total,
  -- loans total (ignoring soft-deleted loans)
  (
    SELECT COALESCE(SUM(l.amount), 0)::NUMERIC(12,2)
    FROM public.loans l
    WHERE l.person_id = p.id AND l.is_deleted = false
  ) AS loans_total,
  -- grand total
  (
    (
      COALESCE(SUM(CASE WHEN e.is_deleted = false THEN e.delta ELSE 0 END), 0)
      * COALESCE(p.price_per_cig, s.default_price)
    )
    +
    (
      SELECT COALESCE(SUM(l.amount), 0)
      FROM public.loans l
      WHERE l.person_id = p.id AND l.is_deleted = false
    )
  )::NUMERIC(12,2) AS grand_total
FROM public.people p
LEFT JOIN public.events e ON e.person_id = p.id
CROSS JOIN LATERAL (
  SELECT default_price FROM public.settings WHERE id = 'global'
) s
GROUP BY p.id, s.default_price;

-- Global receivable view
CREATE OR REPLACE VIEW public.v_global_receivable AS
SELECT COALESCE(SUM(grand_total), 0)::NUMERIC(14,2) AS total_receivable
FROM public.v_person_financials;

-- Enable RLS on loans table
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- RLS policy for loans (single-tenant, open access)
DROP POLICY IF EXISTS loans_all ON public.loans;
CREATE POLICY loans_all ON public.loans
  FOR ALL USING (true) WITH CHECK (true);