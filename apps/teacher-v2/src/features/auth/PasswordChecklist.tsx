import type { PasswordPolicyResult } from '../../core/auth-security';

export function PasswordChecklist({ policy }: { policy: PasswordPolicyResult }) {
  const rules: Array<[boolean, string]> = [
    [policy.minLength, '12 caracteres como mínimo'],
    [policy.lowercase && policy.uppercase, 'Mayúsculas y minúsculas'],
    [policy.number && policy.symbol, 'Número y símbolo'],
    [policy.noWhitespace, 'Sin espacios'],
    [policy.noIdentity && policy.notCommon, 'Sin tu correo ni secuencias comunes'],
  ];

  return (
    <ul className="password-policy" aria-label="Requisitos de la contraseña">
      {rules.map(([complete, label]) => (
        <li className={complete ? 'complete' : ''} key={label}>
          <span aria-hidden="true">{complete ? '✓' : '•'}</span>
          {label}
        </li>
      ))}
    </ul>
  );
}
