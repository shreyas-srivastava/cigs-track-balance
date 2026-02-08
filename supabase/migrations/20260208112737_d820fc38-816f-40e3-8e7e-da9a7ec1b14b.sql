
-- Create repayments table
CREATE TABLE public.repayments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  person_id UUID NOT NULL REFERENCES public.people(id),
  amount NUMERIC NOT NULL,
  repayment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.repayments ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "repayments_all" ON public.repayments FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.repayments;

-- Drop dependent view first
DROP VIEW IF EXISTS public.v_global_receivable;
-- Drop the main view
DROP VIEW IF EXISTS public.v_person_financials;

-- Recreate v_person_financials with repayments
CREATE VIEW public.v_person_financials AS
SELECT
  p.id,
  p.name,
  p.price_per_cig,
  p.is_active,
  p.created_at,
  COALESCE(e.cig_count, 0)::int AS cig_count,
  COALESCE(p.price_per_cig, s.default_price)::numeric(12,2) AS eff_price_per_cig,
  (COALESCE(e.cig_count, 0) * COALESCE(p.price_per_cig, s.default_price))::numeric(12,2) AS cig_total,
  COALESCE(l.loans_total, 0)::numeric(12,2) AS loans_total,
  COALESCE(r.repayments_total, 0)::numeric(12,2) AS repayments_total,
  (COALESCE(e.cig_count, 0) * COALESCE(p.price_per_cig, s.default_price) + COALESCE(l.loans_total, 0) - COALESCE(r.repayments_total, 0))::numeric(12,2) AS grand_total
FROM public.people p
CROSS JOIN (SELECT default_price FROM public.settings WHERE id = 'global') s
LEFT JOIN (
  SELECT person_id, SUM(delta) AS cig_count
  FROM public.events
  WHERE is_deleted = false
  GROUP BY person_id
) e ON e.person_id = p.id
LEFT JOIN (
  SELECT person_id, SUM(amount) AS loans_total
  FROM public.loans
  WHERE is_deleted = false
  GROUP BY person_id
) l ON l.person_id = p.id
LEFT JOIN (
  SELECT person_id, SUM(amount) AS repayments_total
  FROM public.repayments
  WHERE is_deleted = false
  GROUP BY person_id
) r ON r.person_id = p.id
WHERE p.is_active = true;

-- Recreate v_global_receivable
CREATE VIEW public.v_global_receivable AS
SELECT COALESCE(SUM(grand_total), 0)::numeric(12,2) AS total_receivable
FROM public.v_person_financials;
