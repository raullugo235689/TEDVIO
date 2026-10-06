import { Link } from 'react-router-dom';
import { Icon } from './icons';

export function JointAttendanceShortcut() {
  return (
    <Link className="joint-entry" to="/attendance-joint">
      <Icon name="attendance" />
      <span><strong>Asistencia conjunta</strong><small>Varios grupos, un solo QR o enlace para tu clase.</small></span>
      <Icon name="arrow" />
    </Link>
  );
}
