import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';

// Only institute addresses can sign in. The server enforces this too (EMAIL_DOMAIN in the backend's constants);
// checking here just tells the student straight away.
export const INSTITUTE_DOMAIN = '@nitap.ac.in';
export const WRONG_DOMAIN = 'Use your NIT Arunachal Pradesh email address (ending in @nitap.ac.in)';
export const isInstituteEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().toLowerCase().endsWith(INSTITUTE_DOMAIN);

// An email box that says so as soon as the address is clearly not an institute one.
export default function InstituteEmailField({ id, value, onChange, inputRef }) {
  const { t } = useI18n();
  const [blurred, setBlurred] = useState(false);
  const typedDomain = value.includes('@') ? value.slice(value.indexOf('@')).toLowerCase() : '';
  const typing = value.includes('@') && !isInstituteEmail(value) && !INSTITUTE_DOMAIN.startsWith(typedDomain);
  const bad = typing || (blurred && value && !isInstituteEmail(value));
  return (
    <>
      <input
        id={id} ref={inputRef} type="email" autoComplete="email" required value={value}
        placeholder={`name${INSTITUTE_DOMAIN}`} aria-describedby={`${id}-hint`} aria-invalid={bad ? 'true' : 'false'}
        onChange={(e) => onChange(e.target.value)} onBlur={() => setBlurred(true)}
      />
      <p className={bad ? 'error' : 'hint'} id={`${id}-hint`}>{t(bad ? WRONG_DOMAIN : 'Only @nitap.ac.in email addresses can be used.')}</p>
    </>
  );
}
