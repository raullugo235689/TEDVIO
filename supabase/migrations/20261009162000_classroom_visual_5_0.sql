-- TEDVIO Classroom Visual 5.0
-- Non-destructive metadata only. Correct answers remain in v2_question_secrets.
-- A visual labeling question uses the already-secure "ordering" grader.
BEGIN;

ALTER TABLE public.v2_question_bank
  ADD COLUMN IF NOT EXISTS visual_layout jsonb;
ALTER TABLE public.v2_questions
  ADD COLUMN IF NOT EXISTS visual_layout jsonb;

COMMENT ON COLUMN public.v2_question_bank.visual_layout IS
  'Public image target coordinates only; never a label-to-zone answer key.';
COMMENT ON COLUMN public.v2_questions.visual_layout IS
  'Public image target coordinates copied from teacher-owned bank on insert.';

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.v2_question_bank'::regclass
      AND conname = 'tedvio_visual5_bank_layout_check'
  ) THEN
    ALTER TABLE public.v2_question_bank
    ADD CONSTRAINT tedvio_visual5_bank_layout_check CHECK (
      visual_layout IS NULL OR (
        question_type = 'ordering'
        AND jsonb_typeof(visual_layout) = 'object'
        AND visual_layout->>'kind' = 'image_labeling'
        AND visual_layout->>'version' = '1'
        AND jsonb_typeof(visual_layout->'targets') = 'array'
        AND jsonb_array_length(visual_layout->'targets') BETWEEN 2 AND 8
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.v2_questions'::regclass
      AND conname = 'tedvio_visual5_question_layout_check'
  ) THEN
    ALTER TABLE public.v2_questions
    ADD CONSTRAINT tedvio_visual5_question_layout_check CHECK (
      visual_layout IS NULL OR (
        question_type = 'ordering'
        AND jsonb_typeof(visual_layout) = 'object'
        AND visual_layout->>'kind' = 'image_labeling'
        AND visual_layout->>'version' = '1'
        AND jsonb_typeof(visual_layout->'targets') = 'array'
        AND jsonb_array_length(visual_layout->'targets') BETWEEN 2 AND 8
      )
    );
  END IF;
END
$block$;

-- Existing first-session and append routines insert bank_id but not the new
-- metadata column. This trigger attaches safe coordinates automatically.
-- Do not alter launch, scoring, timers, receipts or security RPCs.
CREATE OR REPLACE FUNCTION tedvio_private.v2_attach_visual_layout_v5()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.bank_id IS NOT NULL AND NEW.visual_layout IS NULL THEN
    SELECT b.visual_layout INTO NEW.visual_layout
    FROM public.v2_question_bank b
    JOIN public.v2_sessions s
      ON s.id = NEW.session_id AND s.teacher_id = b.teacher_id
    WHERE b.id = NEW.bank_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS w_v2_questions_attach_visual_layout_v5 ON public.v2_questions;
CREATE TRIGGER w_v2_questions_attach_visual_layout_v5
BEFORE INSERT OR UPDATE OF bank_id ON public.v2_questions
FOR EACH ROW EXECUTE FUNCTION tedvio_private.v2_attach_visual_layout_v5();

REVOKE ALL ON FUNCTION tedvio_private.v2_attach_visual_layout_v5()
  FROM PUBLIC, anon, authenticated;

COMMIT;
