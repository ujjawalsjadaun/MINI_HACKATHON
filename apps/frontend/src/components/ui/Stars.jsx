import { useI18n } from '../../lib/i18n.js';

// Five stars, filled up to the rounded rating, readable as text for screen readers.
export default function Stars({ value }) {
  const { t } = useI18n();
  const filled = Math.round(value);
  return (
    <span className="stars" role="img" aria-label={t('{value} out of 5', { value })}>
      {'★'.repeat(filled)}<span className="off">{'★'.repeat(5 - filled)}</span>
    </span>
  );
}
