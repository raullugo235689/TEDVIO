/** Stable ENARM study taxonomy. Not an official weighting or 2027 syllabus. */
export const ENARM_AREAS = [
  { key: 'medicina_interna', label: 'Medicina Interna', short: 'Medicina Interna', accent: '#4873df' },
  { key: 'pediatria', label: 'Pediatría', short: 'Pediatría', accent: '#17a797' },
  { key: 'ginecologia_obstetricia', label: 'Ginecología y Obstetricia', short: 'Gineco-Obstetricia', accent: '#bf6fbe' },
  { key: 'cirugia', label: 'Cirugía General', short: 'Cirugía', accent: '#ef9962' },
  { key: 'urgencias', label: 'Urgencias', short: 'Urgencias', accent: '#e16f79' },
  { key: 'medicina_familiar', label: 'Medicina Familiar', short: 'Medicina Familiar', accent: '#9079c7' },
  { key: 'salud_publica', label: 'Salud Pública', short: 'Salud Pública', accent: '#63a97f' },
] as const;
export type EnarmArea = (typeof ENARM_AREAS)[number]['key'];
