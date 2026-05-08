CREATE TABLE public.ai_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  label text NOT NULL,
  requested_model text NOT NULL,
  resolved_model text NOT NULL,
  endpoint text NOT NULL,
  base_url text NOT NULL,
  used_fallback boolean NOT NULL DEFAULT false,
  status_code int,
  ok boolean NOT NULL DEFAULT false,
  attempts int NOT NULL DEFAULT 1,
  duration_ms int,
  error text
);

ALTER TABLE public.ai_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_call_logs owner read"
ON public.ai_call_logs FOR SELECT
USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ai_call_logs admin all"
ON public.ai_call_logs FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_ai_call_logs_created_at ON public.ai_call_logs (created_at DESC);
CREATE INDEX idx_ai_call_logs_user ON public.ai_call_logs (user_id, created_at DESC);