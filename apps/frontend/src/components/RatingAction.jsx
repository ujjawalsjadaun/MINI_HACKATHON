import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n.js';
import { Stars } from './ui/index.js';

// On a solved issue: either "Rate this fix" or the rating the student already gave.
export default function RatingAction({ issue }) {
  const { t } = useI18n();
  if (issue.my_rating) return <p className="hint">{t('You rated this fix')} <Stars value={issue.my_rating} /></p>;
  return <div className="row" style={{ marginTop: '.5rem' }}><Link className="button" to={`/issue/${issue.id}`}>{t('Rate this fix')}</Link></div>;
}
