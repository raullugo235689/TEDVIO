-- TEDVIO ENARM 2027 · private, additive study workspace
-- Educational case practice; not affiliated with CIFRHS or an official exam bank.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tedvio_enarm2027_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (length(slug) BETWEEN 4 AND 100),
  area text NOT NULL CHECK (area IN ('medicina_interna','pediatria','ginecologia_obstetricia','cirugia','urgencias','medicina_familiar','salud_publica')),
  topic text NOT NULL CHECK (length(topic) BETWEEN 3 AND 160),
  difficulty text NOT NULL DEFAULT 'intermedio' CHECK (difficulty IN ('basico','intermedio','avanzado')),
  vignette text NOT NULL CHECK (length(vignette) BETWEEN 25 AND 1800),
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 10 AND 360),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) = 4),
  correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  rationale text NOT NULL CHECK (length(rationale) BETWEEN 30 AND 2200),
  reference_hint text NOT NULL DEFAULT 'Consultar guías de práctica clínica vigentes.',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tedvio_enarm2027_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weekly_hours integer NOT NULL DEFAULT 6 CHECK (weekly_hours BETWEEN 1 AND 40),
  target_pct integer NOT NULL DEFAULT 80 CHECK (target_pct BETWEEN 50 AND 100),
  target_date date DEFAULT NULL CHECK (target_date IS NULL OR (target_date BETWEEN DATE '2027-01-01' AND DATE '2027-12-31')),
  desired_specialty text NOT NULL DEFAULT '' CHECK (length(desired_specialty) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tedvio_enarm2027_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.tedvio_enarm2027_questions(id) ON DELETE CASCADE,
  answer_index smallint NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
  is_correct boolean NOT NULL,
  mode text NOT NULL CHECK (mode IN ('practica','repaso','simulador')),
  seconds_taken integer CHECK (seconds_taken IS NULL OR (seconds_taken BETWEEN 0 AND 7200)),
  answered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tedvio_enarm2027_attempts_user_date ON public.tedvio_enarm2027_attempts(user_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS tedvio_enarm2027_attempts_user_question ON public.tedvio_enarm2027_attempts(user_id, question_id, answered_at DESC);

CREATE TABLE IF NOT EXISTS public.tedvio_enarm2027_review (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.tedvio_enarm2027_questions(id) ON DELETE CASCADE,
  stage integer NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 5),
  tries integer NOT NULL DEFAULT 0 CHECK (tries >= 0),
  successes integer NOT NULL DEFAULT 0 CHECK (successes >= 0),
  due_at timestamptz NOT NULL DEFAULT now(),
  last_answered_at timestamptz,
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS tedvio_enarm2027_review_due ON public.tedvio_enarm2027_review (user_id, due_at);

CREATE TABLE IF NOT EXISTS public.tedvio_enarm2027_notes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.tedvio_enarm2027_questions(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (length(note) <= 4000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

-- Never expose keys or explanations through direct table access.
ALTER TABLE public.tedvio_enarm2027_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tedvio_enarm2027_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tedvio_enarm2027_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tedvio_enarm2027_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tedvio_enarm2027_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tedvio_enarm2027_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tedvio_enarm2027_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tedvio_enarm2027_review FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tedvio_enarm2027_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tedvio_enarm2027_notes FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.tedvio_enarm2027_settings TO authenticated;
GRANT SELECT ON public.tedvio_enarm2027_attempts, public.tedvio_enarm2027_review TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tedvio_enarm2027_notes TO authenticated;

CREATE POLICY enarm2027_settings_self_read ON public.tedvio_enarm2027_settings
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY enarm2027_settings_self_insert ON public.tedvio_enarm2027_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY enarm2027_settings_self_update ON public.tedvio_enarm2027_settings
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY enarm2027_attempts_self_read ON public.tedvio_enarm2027_attempts
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY enarm2027_review_self_read ON public.tedvio_enarm2027_review
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY enarm2027_notes_self_read ON public.tedvio_enarm2027_notes
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY enarm2027_notes_self_insert ON public.tedvio_enarm2027_notes
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY enarm2027_notes_self_update ON public.tedvio_enarm2027_notes
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY enarm2027_notes_self_delete ON public.tedvio_enarm2027_notes
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- Only safe stem/options appear before submitting an answer.
CREATE OR REPLACE FUNCTION public.tedvio_enarm2027_catalog(p_area text DEFAULT NULL, p_limit integer DEFAULT 200)
RETURNS TABLE(id uuid, slug text, area text, topic text, difficulty text, vignette text, prompt text, options jsonb)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 400 THEN RAISE EXCEPTION 'LIMIT_INVALID'; END IF;
  IF p_area IS NOT NULL AND p_area NOT IN ('medicina_interna','pediatria','ginecologia_obstetricia','cirugia','urgencias','medicina_familiar','salud_publica') THEN
    RAISE EXCEPTION 'AREA_INVALID';
  END IF;
  RETURN QUERY
    SELECT q.id, q.slug, q.area, q.topic, q.difficulty, q.vignette, q.prompt, q.options
    FROM public.tedvio_enarm2027_questions q
    WHERE q.active = true AND (p_area IS NULL OR q.area = p_area)
    ORDER BY q.area, q.slug
    LIMIT p_limit;
END;
$function$;

-- Server-scored submission; answers cannot be faked from client updates.
CREATE OR REPLACE FUNCTION public.tedvio_enarm2027_submit(
  p_question_id uuid, p_answer_index integer, p_mode text DEFAULT 'practica',
  p_seconds_taken integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_q public.tedvio_enarm2027_questions%ROWTYPE;
  v_previous integer := 0;
  v_stage integer := 0;
  v_correct boolean;
  v_due timestamptz;
  v_attempt_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_answer_index IS NULL OR p_answer_index NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'ANSWER_INVALID'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('practica','repaso','simulador') THEN RAISE EXCEPTION 'MODE_INVALID'; END IF;
  IF p_seconds_taken IS NOT NULL AND p_seconds_taken NOT BETWEEN 0 AND 7200 THEN RAISE EXCEPTION 'TIME_INVALID'; END IF;

  SELECT * INTO v_q FROM public.tedvio_enarm2027_questions
    WHERE id = p_question_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUESTION_UNAVAILABLE'; END IF;

  -- Dedicated per-user advisory lock protects concurrent review updates.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text || ':' || p_question_id::text, 0));
  IF (SELECT COUNT(*) FROM public.tedvio_enarm2027_attempts
      WHERE user_id = v_uid AND answered_at > now() - interval '1 hour') >= 300 THEN
    RAISE EXCEPTION 'RATE_LIMIT';
  END IF;

  SELECT stage INTO v_previous FROM public.tedvio_enarm2027_review
    WHERE user_id = v_uid AND question_id = p_question_id FOR UPDATE;
  v_previous := COALESCE(v_previous, 0);
  v_correct := (p_answer_index = v_q.correct_index);
  v_stage := CASE WHEN v_correct THEN LEAST(v_previous + 1, 5) ELSE 0 END;
  v_due := now() + CASE v_stage
    WHEN 0 THEN interval '1 day'
    WHEN 1 THEN interval '2 days'
    WHEN 2 THEN interval '4 days'
    WHEN 3 THEN interval '7 days'
    WHEN 4 THEN interval '14 days'
    ELSE interval '30 days'
  END;

  INSERT INTO public.tedvio_enarm2027_attempts
    (user_id, question_id, answer_index, is_correct, mode, seconds_taken)
  VALUES (v_uid, p_question_id, p_answer_index, v_correct, p_mode, p_seconds_taken)
  RETURNING id INTO v_attempt_id;

  INSERT INTO public.tedvio_enarm2027_review
    (user_id, question_id, stage, tries, successes, due_at, last_answered_at)
  VALUES (v_uid, p_question_id, v_stage, 1, CASE WHEN v_correct THEN 1 ELSE 0 END, v_due, now())
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    stage = EXCLUDED.stage,
    tries = public.tedvio_enarm2027_review.tries + 1,
    successes = public.tedvio_enarm2027_review.successes + CASE WHEN v_correct THEN 1 ELSE 0 END,
    due_at = EXCLUDED.due_at,
    last_answered_at = EXCLUDED.last_answered_at;

  RETURN pg_catalog.jsonb_build_object(
    'attempt_id', v_attempt_id,
    'correct', v_correct,
    'correct_index', v_q.correct_index,
    'rationale', v_q.rationale,
    'reference_hint', v_q.reference_hint,
    'area', v_q.area,
    'topic', v_q.topic,
    'stage', v_stage,
    'due_at', v_due
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.tedvio_enarm2027_catalog(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tedvio_enarm2027_submit(uuid, integer, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tedvio_enarm2027_catalog(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tedvio_enarm2027_submit(uuid, integer, text, integer) TO authenticated;

COMMENT ON TABLE public.tedvio_enarm2027_questions IS 'Original educational practice cases, never official ENARM 2027 questions.';
COMMENT ON TABLE public.tedvio_enarm2027_attempts IS 'User-isolated private study attempts; writes are server-verified.';

COMMIT;
