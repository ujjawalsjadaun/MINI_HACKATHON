import { useState } from 'react';
import { useToast } from '../app/ToastContext.jsx';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { Stars } from './ui/index.js';

// After a fix is confirmed, the students who reported it can rate it (1 to 5) and say why. They can change it later.
export default function FeedbackPanel({ detail, onDone }) {
  const { t } = useI18n();
  const toast = useToast();
  const { issue, feedback, can_give_feedback: canRate } = detail;
  const [rating, setRating] = useState(feedback.mine?.rating ?? 0);
  const [comment, setComment] = useState(feedback.mine?.comment ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!canRate && !feedback.count) return null;
  const summary = feedback.count > 0 && (
    <p className="muted"><Stars value={feedback.average} /> {t(feedback.count === 1 ? 'Rated {avg} out of 5 by {n} student' : 'Rated {avg} out of 5 by {n} students', { avg: feedback.average, n: feedback.count })}</p>
  );
  if (!canRate) return <div className="card"><h2>{t('Student feedback')}</h2>{summary}</div>;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!rating) { setError(t('Choose a rating from 1 to 5 stars.')); return; }
    setBusy(true);
    try {
      await api(`/issues/${issue.id}/feedback`, { method: 'POST', body: { rating, comment } });
      toast(t('Thanks for your feedback.'));
      setBusy(false);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>{t('Rate this fix')}</h2>
      {summary}
      <form onSubmit={submit}>
        <span className="field-label">{t('How well was it fixed?')}</span>
        <div className="star-pick" role="radiogroup" aria-label={t('How well was it fixed?')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={`star${n <= rating ? ' on' : ''}`} title={t(n === 1 ? '{n} star' : '{n} stars', { n })}>
              <input type="radio" name="rating" value={n} checked={n === rating} aria-label={t(n === 1 ? '{n} star' : '{n} stars', { n })} onChange={() => setRating(n)} />
              {'★'}
            </label>
          ))}
        </div>
        <label htmlFor="fb-comment">{t('Tell us more (optional)')}</label>
        <textarea id="fb-comment" maxLength={300} placeholder={t('What went well, or what could be better?')} value={comment} onChange={(e) => setComment(e.target.value)} />
        <p className="error" role="alert">{error}</p>
        <div className="row" style={{ marginTop: '.75rem' }}>
          <button className="primary" type="submit" disabled={busy}>{t(feedback.mine ? 'Update feedback' : 'Send feedback')}</button>
        </div>
      </form>
    </div>
  );
}
