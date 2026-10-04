import { api } from '../api.js';
import { badge, formatDate, h, toast } from '../dom.js';
import { t } from '../i18n.js';
import { go, route } from '../router.js';
import { emptyState, getMeta, issueCard, noteText, priorityReason, stars, timeline, whereCard } from './shared.js';

function confirmPanel(id) {
  const note = h('textarea', { id: 'reopen-note', maxlength: 300, placeholder: t('If it is not fixed, tell us what is still wrong (optional)') });
  const act = (path, body, message) => async (e) => {
    e.target.disabled = true;
    try {
      await api(`/issues/${id}/${path}`, { method: 'POST', body });
      toast(message);
      go(`/issue/${id}`);
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
    }
  };
  return h('div', { class: 'notice' },
    h('strong', {}, t('The team says this is fixed. Is it?')),
    h('p', { class: 'hint' }, t('The issue only closes when a reporter confirms the fix actually happened.')),
    h('label', { for: 'reopen-note' }, t('Note')), note,
    h('div', { class: 'row', style: 'margin-top:.75rem' },
      h('button', { class: 'primary', type: 'button', onclick: act('confirm', undefined, t('Thanks. Marked as resolved.')) }, t('Yes, it is fixed')),
      h('button', { class: 'secondary', type: 'button', onclick: (e) => act('reopen', { note: note.value }, t('Reopened. The team has been notified.'))(e) }, t('No, reopen it'))));
}

// After a fix is confirmed, the students who reported it can rate it (1 to 5) and say why. They can change it later.
function feedbackPanel({ issue, feedback, can_give_feedback: canRate }) {
  if (!canRate && !feedback.count) return null;
  const summary = feedback.count > 0 && h('p', { class: 'muted' }, stars(feedback.average), ' ',
    t(feedback.count === 1 ? 'Rated {avg} out of 5 by {n} student' : 'Rated {avg} out of 5 by {n} students', { avg: feedback.average, n: feedback.count }));
  if (!canRate) return h('div', { class: 'card' }, h('h2', {}, t('Student feedback')), summary);

  let rating = feedback.mine?.rating ?? 0;
  const pick = h('div', { class: 'star-pick', role: 'radiogroup', 'aria-label': t('How well was it fixed?') });
  const comment = h('textarea', { id: 'fb-comment', maxlength: 300, placeholder: t('What went well, or what could be better?') }, feedback.mine?.comment ?? '');
  const error = h('p', { class: 'error', role: 'alert' });
  const send = h('button', { class: 'primary', type: 'submit' }, t(feedback.mine ? 'Update feedback' : 'Send feedback'));
  const drawStars = () => pick.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('label', { class: `star${n <= rating ? ' on' : ''}`, title: t(n === 1 ? '{n} star' : '{n} stars', { n }) },
    h('input', { type: 'radio', name: 'rating', value: n, checked: n === rating, 'aria-label': t(n === 1 ? '{n} star' : '{n} stars', { n }), onchange: () => { rating = n; drawStars(); } }),
    '\u2605')));
  drawStars();

  return h('div', { class: 'card' },
    h('h2', {}, t('Rate this fix')),
    summary,
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        if (!rating) { error.textContent = t('Choose a rating from 1 to 5 stars.'); return; }
        send.disabled = true;
        try {
          await api(`/issues/${issue.id}/feedback`, { method: 'POST', body: { rating, comment: comment.value } });
          toast(t('Thanks for your feedback.'));
          go(`/issue/${issue.id}`);
        } catch (err) {
          error.textContent = err.message;
          send.disabled = false;
        }
      },
    },
    h('span', { class: 'field-label' }, t('How well was it fixed?')), pick,
    h('label', { for: 'fb-comment' }, t('Tell us more (optional)')), comment,
    error,
    h('div', { class: 'row', style: 'margin-top:.75rem' }, send)));
}

// On a solved issue: either "Rate this fix" or the rating the student already gave.
const ratingAction = (issue) => (issue.my_rating
  ? h('p', { class: 'hint' }, t('You rated this fix'), ' ', stars(issue.my_rating))
  : h('div', { class: 'row', style: 'margin-top:.5rem' }, h('a', { class: 'button', href: `#/issue/${issue.id}` }, t('Rate this fix'))));

route('/mine', ['student'], async () => {
  const [m, issues] = await Promise.all([getMeta(api), api('/issues?mine=1')]);
  return h('section', {},
    h('h1', {}, t('My complaints')),
    h('p', { class: 'muted' }, t('Every problem you reported or confirmed, with its latest status.')),
    issues.length
      ? issues.map((issue) => issueCard(issue, m, { actions: issue.status === 'resolved' ? ratingAction(issue) : null }))
      : emptyState(t('Nothing reported yet'), t('When you report a campus issue it will show up here with live status.'), { href: '#/report', text: t('Report an issue') }));
});

// Everything reported on campus, open or solved, filtered by category and place. With all categories chosen the
// problems are grouped under their category, most urgent group first.
route('/feed', ['student'], async () => {
  const [m, open, solved, mine] = await Promise.all([getMeta(api), api('/issues?status=active'), api('/issues?status=resolved'), api('/issues?mine=1')]);
  const mineById = new Map(mine.map((i) => [i.id, i]));
  const state = { tab: 'open', category: '', location: '' };
  const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': t('Open or solved problems') });
  const chips = h('div', { class: 'seg', role: 'group', 'aria-label': t('Filter by category') });
  const list = h('div', { 'aria-live': 'polite' });
  const place = h('select', { id: 'feed-place', 'aria-label': t('Place'), onchange: (e) => { state.location = e.target.value; draw(); } },
    h('option', { value: '' }, t('All locations')), m.locations.map((l) => h('option', { value: l }, l)));

  const meToo = (issue) => {
    const button = h('button', {
      class: 'secondary', type: 'button',
      onclick: async () => {
        button.disabled = true;
        try {
          await api(`/issues/${issue.id}/me-too`, { method: 'POST' });
          toast(t('Added. The report count and priority went up.'));
          const fresh = (await api(`/issues/${issue.id}`)).issue; // pick up the new count and priority without losing the filters
          open[open.findIndex((i) => i.id === issue.id)] = fresh;
          mineById.set(issue.id, fresh);
          draw();
        } catch (err) {
          toast(err.message, 'error');
          button.disabled = false;
        }
      },
    }, t('Me too'));
    return h('div', { class: 'row', style: 'margin-top:.75rem' }, button,
      h('span', { class: 'hint' }, t('Seeing this problem as well? Confirm it instead of filing a new report.')));
  };

  const actionsFor = (issue) => {
    if (state.tab === 'solved') return mineById.has(issue.id) ? ratingAction({ ...issue, my_rating: mineById.get(issue.id).my_rating }) : null;
    return mineById.has(issue.id) ? h('p', { class: 'hint' }, t('You reported this problem.')) : meToo(issue);
  };

  const chip = (key, text, count) => h('button', {
    type: 'button', class: `seg-btn${state.category === key ? ' on' : ''}`, 'aria-pressed': String(state.category === key),
    onclick: () => { state.category = key; draw(); },
  }, `${text} (${count})`);

  function draw() {
    const source = state.tab === 'open' ? open : solved;
    const inPlace = source.filter((i) => !state.location || i.location === state.location);
    const countOf = (key) => inPlace.filter((i) => i.category === key).length;
    // A category with nothing in it is hidden, unless it is the one selected (so the filter can always be undone).
    if (state.category && !countOf(state.category)) state.category = '';

    tabs.replaceChildren(...[['open', t('Open'), open.length], ['solved', t('Solved'), solved.length]].map(([key, text, count]) => h('button', {
      type: 'button', class: `seg-btn${state.tab === key ? ' on' : ''}`, 'aria-pressed': String(state.tab === key),
      onclick: () => { state.tab = key; state.category = ''; draw(); },
    }, `${text} (${count})`)));
    chips.replaceChildren(chip('', t('All'), inPlace.length), ...m.categories.filter((c) => countOf(c.key) > 0).map((c) => chip(c.key, t(c.label), countOf(c.key))));

    const shown = inPlace.filter((i) => !state.category || i.category === state.category);
    if (!shown.length) {
      list.replaceChildren(state.tab === 'solved' && !solved.length
        ? emptyState(t('Nothing solved yet'), t('Fixed problems will appear here with student ratings.'))
        : state.tab === 'open' && !open.length
          ? emptyState(t('No open issues'), t('Everything reported so far has been resolved.'))
          : emptyState(t('No problems here'), t('Try another category or place.')));
      return;
    }
    const card = (issue) => issueCard(issue, m, { actions: actionsFor(issue) });
    if (state.category) { list.replaceChildren(...shown.map(card)); return; }

    const groups = m.categories.map((c) => ({ category: c, items: shown.filter((i) => i.category === c.key) })).filter((g) => g.items.length)
      .sort((a, b) => Math.max(...b.items.map((i) => i.priority.score)) - Math.max(...a.items.map((i) => i.priority.score)));
    list.replaceChildren(...groups.map((g) => h('section', { class: 'feed-group' },
      h('h2', {}, t(g.category.label), ' ', h('span', { class: 'badge count' }, g.items.length)),
      g.items.map(card))));
  }

  draw();
  return h('section', {},
    h('h1', {}, t('Campus feed')),
    h('p', { class: 'muted' }, t('Open problems across campus, most urgent first. Confirm ones you have also seen.')),
    h('div', { class: 'feed-bar' }, tabs, h('div', {}, place)),
    chips,
    list);
});

route('/issue/:id', ['student'], async ({ id }) => {
  const [m, detail] = await Promise.all([getMeta(api), api(`/issues/${id}`)]);
  const { issue, reports, log } = detail;
  return h('section', {},
    h('p', {}, h('a', { href: '#/mine' }, t('< Back to my complaints'))),
    issueCard(issue, m),
    whereCard(m, issue),
    feedbackPanel(detail),
    h('div', { class: 'card' },
      h('h2', {}, t('Why this priority')),
      h('p', {}, t('{label}, score {score}: {reasons}.', { label: t(issue.priority.label), score: issue.priority.score, reasons: issue.priority.reasons.map(priorityReason).join(', ') })),
      h('p', { class: issue.sla.overdue ? 'error' : 'muted' }, issue.sla.overdue
        ? (issue.sla.overdue_hours > 0
          ? t('The team has passed its {hours}h deadline for this kind of problem by {n} hours.', { hours: issue.sla.hours, n: issue.sla.overdue_hours })
          : t('The team has passed its {hours}h deadline for this kind of problem.', { hours: issue.sla.hours }))
        : t("The team's deadline for this kind of problem is {hours} hours from the report.", { hours: issue.sla.hours }))),
    issue.acknowledged_at && issue.status !== 'resolved' && h('div', { class: 'notice ok' },
      h('strong', {}, t('The team has seen your report. ')), t('Acknowledged by {name} on {date}.', { name: issue.acknowledged_by, date: formatDate(issue.acknowledged_at) })),
    h('div', { class: 'card' },
      h('h2', {}, t('Progress')),
      timeline(log)),
    reports.length > 0 && h('div', { class: 'card reports' },
      h('h2', {}, t('Your report')),
      reports.map((r) => h('div', {},
        h('p', {}, noteText(r.description)),
        r.match_reason && h('p', { class: 'hint' }, t('Grouped with an existing issue: {reason}', { reason: noteText(r.match_reason) })),
        r.photo && h('img', { class: 'photo', src: r.photo, alt: t('Photo you attached to this report') }),
        h('p', { class: 'hint' }, formatDate(r.created_at))))),
    detail.can_confirm && confirmPanel(issue.id),
    issue.status === 'resolved' && h('div', { class: 'notice ok' }, badge('resolved', 'status-resolved'), t(' This issue has been resolved.')));
});
