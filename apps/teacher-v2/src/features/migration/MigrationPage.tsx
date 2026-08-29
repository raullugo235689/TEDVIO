import { LegacyBridge, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon, type IconName } from '../../shared/icons';

type ModuleKey = 'attendance' | 'classroom' | 'bank' | 'exams' | 'gradebook' | 'periods' | 'reports' | 'settings';

const modules: Record<ModuleKey, { eyebrow: string; title: string; detail: string; icon: IconName; phase: string; preserved: string[] }> = {
  attendance: { eyebrow: 'ASISTENCIA', title: 'Asistencia se migrará sin tocar tus listas', detail: 'El ciclo abrir, pausar, cerrar, corregir y exportar seguirá utilizando las mismas tablas y RPC.', icon: 'attendance', phase: 'Fase 2', preserved: ['Listas históricas', 'QR y retardos', 'Correcciones', 'Excel y PDF'] },
  classroom: { eyebrow: 'MODO CLASE', title: 'Un cockpit docente dentro del shell nuevo', detail: 'Se migrarán cronómetro, participación, Live y cierre de clase sin volver a montar la aplicación.', icon: 'classroom', phase: 'Fase 3', preserved: ['Cronómetro', 'Alumno aleatorio', 'Live', 'Resumen de cierre'] },
  bank: { eyebrow: 'BANCO', title: 'Question Studio tendrá una ruta propia', detail: 'El banco dejará de envolver funciones globales y pasará a un módulo React con caché y formularios tipados.', icon: 'bank', phase: 'Fase 3', preserved: ['Reactivos existentes', 'Etiquetas', 'Medios', 'Uso en exámenes'] },
  exams: { eyebrow: 'EVALUACIONES', title: 'OMR y Assessment Intelligence se conservarán', detail: 'La lectura, calificación y analítica permanecerán sobre el modelo actual, con una interfaz unificada.', icon: 'exam', phase: 'Fase 4', preserved: ['Exámenes', 'Resultados OMR', 'Distractores', 'Mapa de contenidos'] },
  gradebook: { eyebrow: 'CALIFICACIONES', title: 'El libro será migrado como módulo central', detail: 'Ponderaciones, evidencias, pendientes y Alumno 360° se moverán sin recalcular ni borrar datos.', icon: 'grades', phase: 'Fase 4', preserved: ['Categorías', 'Actividades', 'Calificaciones', 'Alumno 360°'] },
  periods: { eyebrow: 'PERIODOS', title: 'Los cierres protegidos seguirán vigentes', detail: 'Parciales, fotografías de cierre y reaperturas auditadas conservarán la protección de base de datos.', icon: 'periods', phase: 'Fase 5', preserved: ['Parciales', 'Snapshots', 'Bloqueos', 'Reaperturas'] },
  reports: { eyebrow: 'REPORTES', title: 'Un centro de reportes sin dependencias en el arranque', detail: 'PDF y Excel se cargarán solo cuando el docente los solicite.', icon: 'reports', phase: 'Fase 5', preserved: ['Asistencia', 'Grupo', 'Alumno', 'Cierre académico'] },
  settings: { eyebrow: 'CONFIGURACIÓN', title: 'Preferencias y cuenta en un solo lugar', detail: 'Tema, perfil, institución, horario y seguridad se organizarán en una ruta estable.', icon: 'settings', phase: 'Fase 2', preserved: ['Perfil', 'Tema', 'Institución', 'Horario'] },
};

export function MigrationPage({ module }: { module: ModuleKey }) {
  const item = modules[module];
  return (
    <div className="view-stack">
      <PageHeader eyebrow={item.eyebrow} title={item.title} detail={item.detail} actions={<StatusPill tone="amber">{item.phase}</StatusPill>} />
      <section className="migration-hero-v2">
        <div className="migration-hero-icon"><Icon name={item.icon} /></div>
        <div><span className="eyebrow">MIGRACIÓN CONTROLADA</span><h2>Este módulo todavía opera en TEDVIO actual.</h2><p>No se presentará una versión incompleta como si estuviera terminada. La ruta nueva se activará después de pruebas funcionales y visuales.</p><LegacyBridge label="Abrir módulo operativo" /></div>
      </section>
      <div className="migration-grid-v2">
        <SectionCard><span className="eyebrow">SE CONSERVA</span><h2>Datos y capacidades</h2><ul className="check-list">{item.preserved.map((value) => <li key={value}><Icon name="check" />{value}</li>)}</ul></SectionCard>
        <SectionCard><span className="eyebrow">REGLAS DEL REBUILD</span><h2>Sin volver a crear capas</h2><ul className="check-list"><li><Icon name="check" />Un solo cliente Supabase</li><li><Icon name="check" />Un solo router</li><li><Icon name="check" />Componentes tipados</li><li><Icon name="check" />Sin MutationObserver global</li></ul></SectionCard>
        <SectionCard><span className="eyebrow">ESTADO</span><h2>Backend listo</h2><p className="muted-copy">Las tablas, RPC y políticas existentes permanecen activas. El trabajo pendiente es exclusivamente la nueva experiencia visual y sus pruebas.</p></SectionCard>
      </div>
    </div>
  );
}
