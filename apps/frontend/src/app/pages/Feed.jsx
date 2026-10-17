import { useState } from 'react';
import IssueCard from '../../components/IssueCard.jsx';
import RatingAction from '../../components/RatingAction.jsx';
import { Async, EmptyState, Segmented } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api, getMeta } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.js';
import { useToast } from '../ToastContext.jsx';

function MeToo({ issue, onAdded }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try {
      await api(`/issues/${issue.id}/me-too`, { method: 'POST' });
      toast(t('Added. The report count and priority went up.'));
      onAdded((await api(`/issues/${issue.id}`)).issue); // pick up the new count and priority without losing the filters
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }
  return (
    <div className="row" style={{ marginTop: '.75rem' }}>
      <button className="secondary" type="button" disabled={busy} onClick={add}>{t('Me too')}</button>
      <span className="hint">{t('Seeing this problem as well? Confirm it instead of filing a new report.')}</span>
    </div>
  );
}

// Everything reported on campus, open or solved, filtered by category and place. With all categories chosen the
// problems are grouped under their category, most urgent group first.
function FeedView({ data, setData }) {
  const { t } = useI18n();
  const { meta, open, solved, mine } = data;
  const [tab, setTab] = useState('open');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const mineById = new Map(mine.map((i) => [i.id, i]));

  const source = tab === 'open' ? open : solved;
  const inPlace = source.filter((i) => !location || i.location === location);
  const countOf = (key) => inPlace.filter((i) => i.category === key).length;
  // A category with nothing in it is hidden, unless it is the one selected (so the filter can always be undone).
  const activeCategory = category && countOf(category) ? category : '';
  const shown = inPlace.filter((i) => !activeCategory || i.category === activeCategory);

  const refreshed = (fresh) => setData((d) => ({
    ...d,
    open: d.open.map((i) => (i.id === fresh.id ? fresh : i)),
    mine: d.mine.some((i) => i.id === fresh.id) ? d.mine.map((i) => (i.id === fresh.id ? fresh : i)) : [...d.mine, fresh],
  }));

  const actionsFor = (issue) => {
    if (tab === 'solved') return mineById.has(issue.id) ? <RatingAction issue={{ ...issue, my_rating: mineById.get(issue.id).my_rating }} /> : null;
    return mineById.has(issue.id) ? <p className="hint">{t('You reported this problem.')}</p> : <MeToo issue={issue} onAdded={refreshed} />;
  };
  const card = (issue) => <IssueCard key={issue.id} issue={issue} meta={meta}>{actionsFor(issue)}</IssueCard>;

  let list;
  if (!shown.length) {
    if (tab === 'solved' && !solved.length) list = <EmptyState title={t('Nothing solved yet')} text={t('Fixed problems will appear here with student ratings.')} />;
    else if (tab === 'open' && !open.length) list = <EmptyState title={t('No open issues')} text={t('Everything reported so far has been resolved.')} />;
    else list = <EmptyState title={t('No problems here')} text={t('Try another category or place.')} />;
  } else if (activeCategory) {
    list = shown.map(card);
  } else {
    const groups = meta.categories.map((c) => ({ category: c, items: shown.filter((i) => i.category === c.key) })).filter((g) => g.items.length)
      .sort((a, b) => Math.max(...b.items.map((i) => i.priority.score)) - Math.max(...a.items.map((i) => i.priority.score)));
    list = groups.map((g) => (
      <section className="feed-group" key={g.category.key}>
        <h2>{t(g.category.label)} <span className="badge count">{g.items.length}</span></h2>
        {g.items.map(card)}
      </section>
    ));
  }

  return (
    <section>
      <h1>{t('Campus feed')}</h1>
      <p className="muted">{t('Open problems across campus, most urgent first. Confirm ones you have also seen.')}</p>
      <div className="feed-bar">
        <Segmented
          label={t('Open or solved problems')} value={tab}
          onChange={(next) => { setTab(next); setCategory(''); }}
          options={[{ value: 'open', text: `${t('Open')} (${open.length})` }, { value: 'solved', text: `${t('Solved')} (${solved.length})` }]}
        />
        <div>
          <select id="feed-place" aria-label={t('Place')} value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">{t('All locations')}</option>
            {meta.locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>
      <Segmented
        label={t('Filter by category')} value={activeCategory} onChange={setCategory}
        options={[{ value: '', text: `${t('All')} (${inPlace.length})` }, ...meta.categories.filter((c) => countOf(c.key) > 0).map((c) => ({ value: c.key, text: `${t(c.label)} (${countOf(c.key)})` }))]}
      />
      <div aria-live="polite">{list}</div>
    </section>
  );
}

export default function Feed() {
  const state = useAsync(async () => {
    const [meta, open, solved, mine] = await Promise.all([getMeta(), api('/issues?status=active'), api('/issues?status=resolved'), api('/issues?mine=1')]);
    return { meta, open, solved, mine };
  }, []);
  return <Async state={state}>{(data) => <FeedView data={data} setData={state.setData} />}</Async>;
}
