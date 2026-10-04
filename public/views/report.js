import { api } from '../api.js';
import { h, toast } from '../dom.js';
import { go, route } from '../router.js';
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

  const category = select('category', m.categories.map((c) => [c.key, c.label]), 'Choose a category');
  let checkNearby = () => {};
  const picker = placePicker(m.campus, { onChange: () => checkNearby() });
  const detail = h('input', { id: 'detail', maxlength: 80, placeholder: 'e.g. room number, near the stairs' });
  const description = h('textarea', { id: 'description', required: true, minlength: 8, maxlength: 600, placeholder: 'What is wrong? Be specific so the right team can fix it.' });
  const photo = h('input', { id: 'photo', type: 'file', accept: PHOTO_TYPES.join(',') });
  const error = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { class: 'primary', type: 'submit' }, 'Submit report');
  const similar = h('div', { 'aria-live': 'polite' });
  const aiBox = h('div', { 'aria-live': 'polite' });
  const aiButton = h('button', { class: 'secondary ai-btn', type: 'button' }, '✨ Smart suggest');

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
      h('strong', {}, 'Already reported here. Is this yours?'),
      h('p', { class: 'hint' }, 'Tap "Me too" to join an existing issue instead of filing a duplicate. You will follow its progress under My complaints, and it moves up the queue.'),
      h('ul', {}, matches.map((x) => h('li', {},
        h('strong', {}, x.title), x.detail ? ` (${x.detail})` : '', ` - reported by ${x.report_count} ${x.report_count === 1 ? 'person' : 'people'} `,
        x.likely && h('span', { class: 'badge count' }, 'likely match'), ' ',
        h('button', {
          type: 'button', class: 'secondary',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              await api(`/issues/${x.id}/me-too`, { method: 'POST' });
              toast('Confirmed. Thanks, this helps prioritise the fix.');
              go('/mine');
            } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
          },
        }, 'Me too, this is mine')))));
  }

  for (const el of [category, description, detail]) el.addEventListener('input', checkNearby);
  checkNearby();

  // Suggestion helper: suggests a category and a clearer description. The student decides what to use.
  const aiEnabled = await api('/ai/status').then((r) => r.enabled).catch(() => false);
  aiButton.addEventListener('click', async () => {
    if (description.value.trim().length < 8) { aiBox.replaceChildren(h('p', { class: 'hint' }, 'Write a few words about the problem first.')); return; }
    aiButton.disabled = true;
    aiButton.textContent = 'Thinking...';
    try {
      const s = await api('/ai/suggest', { method: 'POST', body: { description: description.value, location: picker.place } });
      const label = m.categories.find((c) => c.key === s.category)?.label ?? s.category;
      aiBox.replaceChildren(h('div', { class: `notice ai-box${s.urgent ? ' urgent' : ''}` },
        h('strong', {}, `✨ Suggestion (${s.source})`),
        s.urgent && h('p', { class: 'error' }, 'This looks like a safety hazard. Keep away from it and tell a staff member if it is dangerous right now.'),
        h('p', {}, h('strong', {}, 'Category: '), label, h('span', { class: 'hint' }, ` - ${s.reason}`)),
        h('p', {}, h('strong', {}, 'Clearer description: '), s.description),
        h('div', { class: 'row' },
          h('button', { class: 'primary', type: 'button', onclick: () => {
            category.value = s.category;
            description.value = s.description;
            aiBox.replaceChildren();
            checkNearby();
            toast('Suggestion applied. Check it before you submit.');
          } }, 'Use this'),
          h('button', { class: 'secondary', type: 'button', onclick: () => aiBox.replaceChildren() }, 'Keep mine')),
        h('p', { class: 'hint' }, 'Suggestions can be wrong. You decide what gets submitted.')));
    } catch (err) {
      aiBox.replaceChildren(h('p', { class: 'error', role: 'alert' }, err.message));
    } finally {
      aiButton.disabled = false;
      aiButton.textContent = '✨ Smart suggest';
    }
  });

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = '';
      const file = photo.files[0];
      if (file && !PHOTO_TYPES.includes(file.type)) { error.textContent = 'Photo must be a JPG, PNG or WebP image.'; return; }
      if (file && file.size > MAX_PHOTO) { error.textContent = 'Photo must be under 5 MB.'; return; }

      const data = new FormData();
      data.append('category', category.value);
      if (!picker.place) { error.textContent = 'Choose where the problem is on the campus map.'; return; }
      data.append('location', picker.place);
      data.append('detail', [picker.floor, detail.value.trim()].filter(Boolean).join(', '));
      data.append('description', description.value);
      if (file) data.append('photo', file);

      submit.disabled = true;
      submit.textContent = 'Submitting...';
      try {
        const result = await api('/issues', { method: 'POST', form: data });
        toast(result.merged
          ? 'Grouped with an existing report of the same problem. Priority raised.'
          : 'Report submitted and routed to the right team.');
        go(`/issue/${result.issueId}`);
      } catch (err) {
        error.textContent = err.message;
        submit.disabled = false;
        submit.textContent = 'Submit report';
      }
    },
  },
  h('label', { for: 'category' }, 'Category'), category,
  h('span', { class: 'field-label' }, 'Where is the problem?'), picker.el,
  h('label', { for: 'detail' }, 'Room / spot (optional)'), detail,
  h('label', { for: 'description' }, 'Description'), description,
  aiEnabled && h('div', { class: 'row', style: 'margin-top:.5rem' }, aiButton, h('span', { class: 'hint' }, 'Not sure which category fits or how to word it? Get a suggestion.')),
  aiEnabled && aiBox,
  h('label', { for: 'photo' }, 'Photo (optional)'), photo,
  h('p', { class: 'hint' }, 'JPG, PNG or WebP, up to 5 MB.'),
  similar, error,
  h('div', { class: 'row', style: 'margin-top:1rem' }, submit));

  return h('section', { class: 'card', style: 'max-width:640px' },
    h('h1', {}, 'Report a campus issue'),
    taggedLocation && h('div', { class: 'notice ok' }, `Location set from QR tag: ${taggedLocation}${detail.value ? `, ${detail.value}` : ''}`),
    h('p', { class: 'muted' }, 'It is routed to the right team automatically. If others already reported the same problem, your report is grouped with theirs.'),
    form);
});
