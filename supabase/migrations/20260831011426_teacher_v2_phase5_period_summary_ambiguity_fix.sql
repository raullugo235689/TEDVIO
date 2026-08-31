-- TEDVIO 2.0 · Fase 5.1
-- Califica la cobertura por alumno para evitar colisión con la variable del resumen global.
do $do$
declare
  definition text;
begin
  definition := pg_get_functiondef('public.v2_teacher_academic_period_summary(uuid)'::regprocedure);
  if position('''evidence_weight'',evidence_weight,''attendance_rate''' in definition) = 0 then
    raise exception 'No se encontró el fragmento esperado del resumen académico.';
  end if;
  definition := replace(
    definition,
    '''evidence_weight'',evidence_weight,''attendance_rate''',
    '''evidence_weight'',calc.evidence_weight,''attendance_rate'''
  );
  execute definition;
end;
$do$;
