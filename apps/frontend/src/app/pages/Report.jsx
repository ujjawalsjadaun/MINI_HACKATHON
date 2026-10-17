import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CampusMap from '../../components/CampusMap.jsx';
import EmergencyHelp from '../../components/EmergencyHelp.jsx';
import PlacePicker, { floorName } from '../../components/PlacePicker.jsx';
import SimilarIssues from '../../components/SimilarIssues.jsx';
import SuggestionBox from '../../components/SuggestionBox.jsx';
import { Async } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api, getEmergency, getMeta } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.js';
import { useToast } from '../ToastContext.jsx';

const MAX_PHOTO = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function ReportForm({ meta, aiEnabled }) {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Opened from a QR sticker: location (and room) arrive pre-filled.
  const taggedLocation = meta.locations.includes(params.get('location')) ? params.get('location') : '';
  const [category, setCategory] = useState('');
  const [where, setWhere] = useState({ place: taggedLocation, floor: '' });
  const [detail, setDetail] = useState(taggedLocation ? (params.get('detail') ?? '').slice(0, 100) : '');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('normal');
  const [pin, setPin] = useState(null);
  const [matches, setMatches] = useState([]);
  const [directory, setDirectory] = useState({ groups: [] });
  const [suggestion, setSuggestion] = useState(null);
  const [aiMessage, setAiMessage] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const photo = useRef(null);
  const lastQuery = useRef('');

  useEffect(() => { getEmergency().then(setDirectory); }, []);

  // As soon as a location is chosen, list what is already open there.
  useEffect(() => {
    if (!where.place) return undefined;
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({ location: where.place, category, detail, description }).toString();
      if (query === lastQuery.current) return;
      lastQuery.current = query;
      try { setMatches(await api(`/issues/nearby?${query}`)); } catch { setMatches([]); }
    }, 350);
    return () => clearTimeout(timer);
  }, [where.place, category, detail, description]);

  const urgencyText = {
    normal: [t('Normal'), t('Can wait a few days')],
    urgent: [t('Urgent'), t('Affects many people or daily work')],
    emergency: [t('Emergency'), t('Danger to people: sparks, flooding, broken stairs')],
  };

  // Tapping a building picks the place; tapping anywhere drops a pin on the exact spot.
  const onMapPick = ({ place, x, y }) => {
    setPin({ x, y });
    if (place && place !== where.place) setWhere({ place, floor: '' });
  };

  async function suggest() {
    if (description.trim().length < 8) { setSuggestion(null); setAiMessage(t('Write a few words about the problem first.')); return; }
    setThinking(true);
    setAiMessage('');
    try {
      setSuggestion(await api('/ai/suggest', { method: 'POST', body: { description, location: where.place } }));
    } catch (err) {
      setSuggestion(null);
      setAiMessage(err.message);
    } finally {
      setThinking(false);
    }
  }

  function useSuggestion() {
    setCategory(suggestion.category);
    setDescription(suggestion.description);
    if (suggestion.urgent) setUrgency('emergency');
    setSuggestion(null);
    toast(t('Suggestion applied. Check it before you submit.'));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const file = photo.current.files[0];
    if (file && !PHOTO_TYPES.includes(file.type)) { setError(t('Photo must be a JPG, PNG or WebP image.')); return; }
    if (file && file.size > MAX_PHOTO) { setError(t('Photo must be under 5 MB.')); return; }
    if (!where.place) { setError(t('Choose where the problem is on the campus map.')); return; }

    const data = new FormData();
    data.append('category', category);
    data.append('location', where.place);
    data.append('detail', [where.floor && floorName(where.floor), detail.trim()].filter(Boolean).join(', '));
    data.append('description', description);
    data.append('urgency', urgency);
    if (pin) { data.append('pin_x', pin.x); data.append('pin_y', pin.y); }
    if (file) data.append('photo', file);

    setBusy(true);
    try {
      const result = await api('/issues', { method: 'POST', form: data });
      toast(result.merged
        ? t('Grouped with an existing report of the same problem. Priority raised.')
        : t('Report submitted and routed to the right team.'));
      navigate(`/issue/${result.issueId}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 640 }}>
      <h1>{t('Report a campus issue')}</h1>
      {taggedLocation && <div className="notice ok">{`${t('Location set from QR tag: {place}', { place: taggedLocation })}${detail ? `, ${detail}` : ''}`}</div>}
      <p className="muted">{t('It is routed to the right team automatically. If others already reported the same problem, your report is grouped with theirs.')}</p>
      <form onSubmit={submit}>
        <label htmlFor="category">{t('Category')}</label>
        <select id="category" required value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t('Choose a category')}</option>
          {meta.categories.map((c) => <option key={c.key} value={c.key}>{t(c.label)}</option>)}
        </select>

        <span className="field-label">{t('Where is the problem?')}</span>
        <PlacePicker campus={meta.campus} place={where.place} floor={where.floor} onChange={setWhere} />
        <div className="map-wrap"><CampusMap meta={meta} interactive place={where.place} pin={pin} onPick={onMapPick} /></div>
        <div className="row">
          <p className="hint" aria-live="polite">{pin ? t('Pin dropped. It will be saved with your report.') : t('Tap the map to drop a pin on the exact spot (optional). The map is a drawing, not to scale.')}</p>
          <button className="secondary" type="button" onClick={() => setPin(null)}>{t('Remove pin')}</button>
        </div>

        <label htmlFor="detail">{t('Room / spot (optional)')}</label>
        <input id="detail" maxLength={80} placeholder={t('e.g. room number, near the stairs')} value={detail} onChange={(e) => setDetail(e.target.value)} />

        <label htmlFor="description">{t('Description')}</label>
        <textarea id="description" required minLength={8} maxLength={600} placeholder={t('What is wrong? Be specific so the right team can fix it.')} value={description} onChange={(e) => setDescription(e.target.value)} />

        {aiEnabled && (
          <div className="row" style={{ marginTop: '.5rem' }}>
            <button className="secondary ai-btn" type="button" disabled={thinking} onClick={suggest}>{thinking ? t('Thinking...') : t('✨ Smart suggest')}</button>
            <span className="hint">{t('Not sure which category fits or how to word it? Get a suggestion.')}</span>
          </div>
        )}
        {aiEnabled && (
          <div aria-live="polite">
            {aiMessage && <p className={suggestion ? 'hint' : 'error'} role="alert">{aiMessage}</p>}
            {suggestion && <SuggestionBox meta={meta} suggestion={suggestion} onUse={useSuggestion} onDismiss={() => setSuggestion(null)} />}
          </div>
        )}

        <span className="field-label">{t('How urgent is it?')}</span>
        <div className="chips" role="radiogroup" aria-label={t('How urgent is it?')}>
          {meta.urgencies.map((u) => (
            <label key={u.key} className={`chip urgency-${u.key}${u.key === urgency ? ' on' : ''}`}>
              <input type="radio" name="urgency" value={u.key} checked={u.key === urgency} onChange={() => setUrgency(u.key)} />
              {urgencyText[u.key][0]}<small>{urgencyText[u.key][1]}</small>
            </label>
          ))}
        </div>
        <p className="hint">{t('Be honest: this raises the priority, and the team can see every rating.')}</p>

        <EmergencyHelp meta={meta} directory={directory} urgency={urgency} category={category} place={where.place} />

        <label htmlFor="photo">{t('Photo (optional)')}</label>
        <input id="photo" type="file" accept={PHOTO_TYPES.join(',')} ref={photo} />
        <p className="hint">{t('JPG, PNG or WebP, up to 5 MB.')}</p>

        <SimilarIssues matches={matches} />
        <p className="error" role="alert">{error}</p>
        <div className="row" style={{ marginTop: '1rem' }}>
          <button className="primary" type="submit" disabled={busy}>{busy ? t('Submitting...') : t('Submit report')}</button>
        </div>
      </form>
    </section>
  );
}

export default function Report() {
  const state = useAsync(async () => {
    const [meta, aiEnabled] = await Promise.all([getMeta(), api('/ai/status').then((r) => r.enabled).catch(() => false)]);
    return { meta, aiEnabled };
  }, []);
  return <Async state={state}>{({ meta, aiEnabled }) => <ReportForm meta={meta} aiEnabled={aiEnabled} />}</Async>;
}
