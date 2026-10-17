import { useI18n } from '../lib/i18n.js';
import { formatDate } from '../lib/format.js';
import { Stars } from './ui/index.js';

// What students said about the fix. Staff see comments without names; admins also see who wrote them.
export default function FeedbackCard({ feedback }) {
  const { t, locale } = useI18n();
  return (
    <div className="card">
      <h2>{t('Student feedback')}</h2>
      {feedback.count ? (
        <>
          <p><Stars value={feedback.average} /> {t(feedback.count === 1 ? 'Rated {avg} out of 5 by {n} student' : 'Rated {avg} out of 5 by {n} students', { avg: feedback.average, n: feedback.count })}</p>
          {feedback.entries.map((e, i) => (
            <div key={i} style={{ borderTop: '1px solid var(--border)', padding: '.6rem 0' }}>
              <Stars value={e.rating} /> <span className="hint">{formatDate(e.created_at, locale)}{e.reporter ? ` - ${e.reporter}` : ''}</span>
              {e.comment && <p>{e.comment}</p>}
            </div>
          ))}
        </>
      ) : <p className="muted">{t('No feedback yet.')}</p>}
    </div>
  );
}
