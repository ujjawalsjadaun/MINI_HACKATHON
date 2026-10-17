import { useI18n } from '../../lib/i18n.js';
import { label } from '../../lib/format.js';

export default function Badge({ text, className }) {
  const { t } = useI18n();
  return <span className={`badge ${className}`}>{t(label(text))}</span>;
}
