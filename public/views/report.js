import { api } from '../api.js';
import { h, toast } from '../dom.js';
import { t } from '../i18n.js';
import { go, route } from '../router.js';
import { campusMap } from './campus-map.js';
import { placePicker } from './place-picker.js';
import { getMeta } from './shared.js';

const MAX_PHOTO = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

route('/report', ['student'], async () => {
  const m = await getMeta(api);
  const tag = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const select = (id, options, placeholder) =>
    h('select', { id, required: true },
      h('option', { value: '' }, placeholder),
      options.map(([value, text]) => h('option', { value }, text)));

  const category = select('category', m.categories.map((c) => [c.key, t(c.label)]), t('Choose a category'));
  let checkNearby = () => {};
  let map;
  const picker = placePicker(m.campus, { onChange: () => { checkNearby(); map?.setPlace(picker.place); } });

  // Optional: tap the schematic map to drop a pin on the exact spot (tapping a building also picks the place).
  const pinNote = h('p', { class: 'hint', 'aria-live': 'polite' });
  const showPinNote = () => { pinNote.textContent = map.pin ? t('Pin dropped. It will be saved with your report.') : t('Tap the map to drop a pin on the exact spot (optional). The map is a drawing, not to scale.'); };
  map = campusMap(m, {
    interactive: true,
    onPick: ({ place }) => { if (place && place !== picker.place) picker.select(place); showPinNote(); },
  });
  showPinNote();
  const clearPin = h('button', { class: 'secondary', type: 'button', onclick: () => { map.setPin(null); showPinNote(); } }, t('Remove pin'));
  const detail = h('input', { id: 'detail', maxlength: 80, placeholder: t('e.g. room number, near the stairs') });
  const description = h('textarea', { id: 'description', required: true, minlength: 8, maxlength: 600, placeholder: t('What is wrong? Be specific so the right team can fix it.') });
  const photo = h('input', { id: 'photo', type: 'file', accept: PHOTO_TYPES.join(',') });
  const error = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { class: 'primary', type: 'submit' }, t('Submit report'));
  const similar = h('div', { 'aria-live': 'polite' });

  // The reporter's own urgency rating; it adds to the priority score, and the highest rating on an issue counts once.
  const URGENCY_TEXT = { normal: [t('Normal'), t('Can wait a few days')], urgent: [t('Urgent'), t('Affects many people or daily work')], emergency: [t('Emergency'), t('Danger to people: sparks, flooding, broken stairs')] };
  let urgency = 'normal';
  const urgencyBox = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': t('How urgent is it?') });
  const drawUrgency = () => urgencyBox.replaceChildren(...m.urgencies.map((u) => h('label', { class: `chip urgency-${u.key}${u.key === urgency ? ' on' : ''}` },
    h('input', { type: 'radio', name: 'urgency', value: u.key, checked: u.key === urgency, onchange: () => { urgency = u.key; drawUrgency(); } }),
    URGENCY_TEXT[u.key][0], h('small', {}, URGENCY_TEXT[u.key][1]))));
  drawUrgency();
  const aiBox = h('div', { 'aria-live': 'polite' });
  const aiButton = h('button', { class: 'secondary ai-btn', type: 'button' }, t('✨ Smart suggest'));

  // Opened from a QR sticker: location (and room) arrive pre-filled.
  const taggedLocation = m.locations.includes(tag.get('location')) ? tag.get('location') : '';
  if (taggedLocation) picker.select(taggedLocation);
  if (taggedLocation && tag.get('detail')) detail.value = tag.get('detail').slice(0, 100);

  // As soon as a location is chosen, list what is already open there so the student can
  // join an existing issue ("Me too") instead of filing a duplicate.
  let timer;
  let lastKey = '';
  checkNearby = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const query = new URLSearchParams({ location: picker.place, category: category.value, detail: detail.value, description: description.value });
      const key = query.toString();
      if (!picker.place || key === lastKey) return;
      lastKey = key;
      try {
        const matches = await api(`/issues/nearby?${query}`);
        similar.replaceChildren(...(matches.length ? [renderMatches(matches)] : []));
      } catch { similar.replaceChildren(); }
    }, 350);
  };

  function renderMatches(matches) {
    return h('div', { class: 'notice' },
      h('strong', {}, t('Already reported here. Is this yours?')),
      h('p', { class: 'hint' }, t('Tap "Me too" to join an existing issue instead of filing a duplicate. You will follow its progress under My complaints, and it moves up the queue.')),
      h('ul', {}, matches.map((x) => h('li', {},
        h('strong', {}, x.title), x.detail ? ` (${x.detail})` : '', ` - ${t(x.report_count === 1 ? 'reported by {n} person' : 'reported by {n} people', { n: x.report_count })} `,
        x.likely && h('span', { class: 'badge count' }, t('likely match')), ' ',
        h('button', {
          type: 'button', class: 'secondary',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              await api(`/issues/${x.id}/me-too`, { method: 'POST' });
              toast(t('Confirmed. Thanks, this helps prioritise the fix.'));
              go('/mine');
            } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
          },
        }, t('Me too, this is mine'))))));
  }

  for (const el of [category, description, detail]) el.addEventListener('input', checkNearby);
  checkNearby();

  // Suggestion helper: suggests a category and a clearer description. The student decides what to use.
  const aiEnabled = await api('/ai/status').then((r) => r.enabled).catch(() => false);
  aiButton.addEventListener('click', async () => {
    if (description.value.trim().length < 8) { aiBox.replaceChildren(h('p', { class: 'hint' }, t('Write a few words about the problem first.'))); return; }
    aiButton.disabled = true;
    aiButton.textContent = t('Thinking...');
    try {
      const s = await api('/ai/suggest', { method: 'POST', body: { description: description.value, location: picker.place } });
      const label = t(m.categories.find((c) => c.key === s.category)?.label ?? s.category);
      // The server explains its choice in English ("Matched \"leak\", \"pipe\""); the matched words stay as they were.
      const reason = s.reason.startsWith('Matched ') ? t('Matched {words}', { words: s.reason.slice(8) }) : t(s.reason);
      aiBox.replaceChildren(h('div', { class: `notice ai-box${s.urgent ? ' urgent' : ''}` },
        h('strong', {}, t('✨ Suggestion ({source})', { source: t(s.source) })),
        s.urgent && h('p', { class: 'error' }, t('This looks like a safety hazard. Keep away from it and tell a staff member if it is dangerous right now.')),
        h('p', {}, h('strong', {}, t('Category: ')), label, h('span', { class: 'hint' }, ` - ${reason}`)),
        h('p', {}, h('strong', {}, t('Clearer description: ')), s.description),
        h('div', { class: 'row' },
          h('button', { class: 'primary', type: 'button', onclick: () => {
            category.value = s.category;
            description.value = s.description;
            if (s.urgent) { urgency = 'emergency'; drawUrgency(); }
            aiBox.replaceChildren();
            checkNearby();
            toast(t('Suggestion applied. Check it before you submit.'));
          } }, t('Use this')),
          h('button', { class: 'secondary', type: 'button', onclick: () => aiBox.replaceChildren() }, t('Keep mine'))),
        h('p', { class: 'hint' }, t('Suggestions can be wrong. You decide what gets submitted.'))));
    } catch (err) {
      aiBox.replaceChildren(h('p', { class: 'error', role: 'alert' }, err.message));
    } finally {
      aiButton.disabled = false;
      aiButton.textContent = t('✨ Smart suggest');
    }
  });

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = '';
      const file = photo.files[0];
      if (file && !PHOTO_TYPES.includes(file.type)) { error.textContent = t('Photo must be a JPG, PNG or WebP image.'); return; }
      if (file && file.size > MAX_PHOTO) { error.textContent = t('Photo must be under 5 MB.'); return; }

      const data = new FormData();
      data.append('category', category.value);
      if (!picker.place) { error.textContent = t('Choose where the problem is on the campus map.'); return; }
      data.append('location', picker.place);
      data.append('detail', [picker.floor, detail.value.trim()].filter(Boolean).join(', '));
      data.append('description', description.value);
      data.append('urgency', urgency);
      if (map.pin) { data.append('pin_x', map.pin.x); data.append('pin_y', map.pin.y); }
      if (file) data.append('photo', file);

      submit.disabled = true;
      submit.textContent = t('Submitting...');
      try {
        const result = await api('/issues', { method: 'POST', form: data });
        toast(result.merged
          ? t('Grouped with an existing report of the same problem. Priority raised.')
          : t('Report submitted and routed to the right team.'));
        go(`/issue/${result.issueId}`);
      } catch (err) {
        error.textContent = err.message;
        submit.disabled = false;
        submit.textContent = t('Submit report');
      }
    },
  },
  h('label', { for: 'category' }, t('Category')), category,
  h('span', { class: 'field-label' }, t('Where is the problem?')), picker.el,
  h('div', { class: 'map-wrap' }, map.el), h('div', { class: 'row' }, pinNote, clearPin),
  h('label', { for: 'detail' }, t('Room / spot (optional)')), detail,
  h('label', { for: 'description' }, t('Description')), description,
  aiEnabled && h('div', { class: 'row', style: 'margin-top:.5rem' }, aiButton, h('span', { class: 'hint' }, t('Not sure which category fits or how to word it? Get a suggestion.'))),
  aiEnabled && aiBox,
  h('span', { class: 'field-label' }, t('How urgent is it?')), urgencyBox,
  h('p', { class: 'hint' }, t('Be honest: this raises the priority, and the team can see every rating.')),
  h('label', { for: 'photo' }, t('Photo (optional)')), photo,
  h('p', { class: 'hint' }, t('JPG, PNG or WebP, up to 5 MB.')),
  similar, error,
  h('div', { class: 'row', style: 'margin-top:1rem' }, submit));

  return h('section', { class: 'card', style: 'max-width:640px' },
    h('h1', {}, t('Report a campus issue')),
    taggedLocation && h('div', { class: 'notice ok' }, `${t('Location set from QR tag: {place}', { place: taggedLocation })}${detail.value ? `, ${detail.value}` : ''}`),
    h('p', { class: 'muted' }, t('It is routed to the right team automatically. If others already reported the same problem, your report is grouped with theirs.')),
    form);
});
