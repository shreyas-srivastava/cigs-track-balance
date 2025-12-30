-- Create share_links table for storing view-only link tokens
CREATE TABLE public.share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    label TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    passcode_hash TEXT,
    allow_export BOOLEAN NOT NULL DEFAULT false,
    mask_sensitive BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    access_count INTEGER NOT NULL DEFAULT 0
);

-- Create access_logs table for auditing
CREATE TABLE public.access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_link_id UUID NOT NULL REFERENCES public.share_links(id) ON DELETE CASCADE,
    accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    ip_address TEXT,
    user_agent TEXT
);

-- Enable RLS on share_links
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

-- RLS policies for share_links (anyone can manage for now - no auth in app)
CREATE POLICY "share_links_all" ON public.share_links FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on access_logs
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for access_logs
CREATE POLICY "access_logs_all" ON public.access_logs FOR ALL USING (true) WITH CHECK (true);

-- Create index on token for fast lookups
CREATE INDEX idx_share_links_token ON public.share_links(token);

-- Create index on person_id for listing links per person
CREATE INDEX idx_share_links_person_id ON public.share_links(person_id);

-- Create index on share_link_id for access logs
CREATE INDEX idx_access_logs_share_link_id ON public.access_logs(share_link_id);

-- Function to auto-expire old links
CREATE OR REPLACE FUNCTION public.update_expired_share_links()
RETURNS TRIGGER AS $$
BEGIN
  -- Update status to expired if past expiry
  IF NEW.expires_at < now() AND NEW.status = 'active' THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger to check expiry on access
CREATE TRIGGER check_share_link_expiry
BEFORE UPDATE ON public.share_links
FOR EACH ROW
EXECUTE FUNCTION public.update_expired_share_links();