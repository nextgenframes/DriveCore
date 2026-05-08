-- Promote demo account to admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'drivecore@drivecore.local'
ON CONFLICT (user_id, role) DO NOTHING;

-- Self-improvement learnings table
CREATE TYPE public.learning_category AS ENUM ('correction', 'insight', 'error', 'best_practice');

CREATE TABLE public.qwen_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  incident_id uuid REFERENCES public.incidents(id) ON DELETE SET NULL,
  category public.learning_category NOT NULL DEFAULT 'correction',
  content text NOT NULL,
  context text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qwen_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learnings owner read" ON public.qwen_learnings
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "learnings owner insert" ON public.qwen_learnings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "learnings owner delete" ON public.qwen_learnings
  FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_qwen_learnings_recent ON public.qwen_learnings (created_at DESC);