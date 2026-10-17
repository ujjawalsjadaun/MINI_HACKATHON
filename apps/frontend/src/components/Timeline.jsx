import { useI18n } from '../lib/i18n.js';
import { formatDate } from '../lib/format.js';
import { noteText } from '../lib/describe.js';

export default function Timeline({ log }) {
  const { t, locale } = useI18n();
  return (
    <ol className="timeline">
      {log.map((entry, i) => (
        <li key={i}>
          <time>{formatDate(entry.created_at, locale)}</time>
          <strong>{t(entry.status.replace(/_/g, ' '))}</strong>
          {entry.note && <div>{noteText(entry.note)}</div>}
          <div className="muted">{t('by {actor}', { actor: t(entry.actor) })}</div>
        </li>
      ))}
    </ol>
  );
}
