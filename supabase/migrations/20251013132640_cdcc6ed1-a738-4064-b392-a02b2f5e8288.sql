-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create app_role enum
CREATE TYPE app_role AS ENUM ('admin', 'user');

-- Settings table for global configuration
CREATE TABLE IF NOT EXISTS public.settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  default_price NUMERIC(10, 2) NOT NULL DEFAULT 12.00,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO public.settings (id, default_price) 
VALUES ('global', 12.00)
ON CONFLICT (id) DO NOTHING;

-- People/customers table
CREATE TABLE IF NOT EXISTS public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  price_per_cig NUMERIC(10, 2) NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events table for tracking cigarette increments/decrements
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK (delta IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster event lookups
CREATE INDEX IF NOT EXISTS idx_events_person_id ON public.events(person_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events(created_at DESC);

-- Computed totals view
CREATE OR REPLACE VIEW public.v_person_totals AS
SELECT 
  p.id,
  p.name,
  p.price_per_cig,
  p.is_active,
  p.created_at,
  COALESCE(SUM(e.delta), 0)::INTEGER AS count,
  (COALESCE(SUM(e.delta), 0) * COALESCE(p.price_per_cig, (SELECT default_price FROM public.settings WHERE id = 'global')))::NUMERIC(10, 2) AS total
FROM public.people p
LEFT JOIN public.events e ON e.person_id = p.id
GROUP BY p.id, p.name, p.price_per_cig, p.is_active, p.created_at;

-- Enable Row Level Security
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (single-tenant shop use case)
-- Settings policies
CREATE POLICY "Anyone can read settings"
  ON public.settings FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update settings"
  ON public.settings FOR UPDATE
  USING (true);

-- People policies
CREATE POLICY "Anyone can read people"
  ON public.people FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert people"
  ON public.people FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update people"
  ON public.people FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete people"
  ON public.people FOR DELETE
  USING (true);

-- Events policies
CREATE POLICY "Anyone can read events"
  ON public.events FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert events"
  ON public.events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can delete events"
  ON public.events FOR DELETE
  USING (true);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.people;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;