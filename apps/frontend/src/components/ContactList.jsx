import { useI18n } from '../lib/i18n.js';
import { phoneHref } from '../lib/describe.js';

// A list of people to call, each number a tap-to-call link.
export default function ContactList({ entries }) {
  const { t } = useI18n();
  return (
    <ul className="contacts">
      {entries.map((e, i) => (
        <li key={i}>
          <span className="who-to-call"><strong>{t(e.role)}</strong>{e.name && ` - ${t(e.name)}`}</span>
          <span className="numbers">{e.phones.map((p) => <a key={p} className="button call" href={phoneHref(p)}>{p}</a>)}</span>
        </li>
      ))}
    </ul>
  );
}
