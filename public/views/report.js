import { api } from '../api.js';
import { h, toast } from '../dom.js';
import { go, route } from '../router.js';
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
  const location = select('location', m.locations.map((l) => [l, l]), 'Choose a location');
  const detail = h('input', { id: 'detail', maxlength: 100, placeholder: 'e.g. 2nd floor, near the stairs' });
  const description = h('textarea', { id: 'description', required: true, minlength: 8, maxlength: 600, placeholder: 'What is wrong? Be specific so the right team can fix it.' });
  const photo = h('input', { id: 'photo', type: 'file', accept: PHOTO_TYPES.join(',') });
  const error = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { class: 'primary', type: 'submit' }, 'Submit report');
  const similar = h('div', { 'aria-live': 'polite' });

  // Opened from a QR sticker: location (and room) arrive pre-filled.
  const taggedLocation = m.locations.includes(tag.get('location')) ? tag.get('location') : '';
  if (taggedLocation) location.value = taggedLocation;
  if (taggedLocation && tag.get('detail')) detail.value = tag.get('detail').slice(0, 100);

  // Before filing, show open issues at the same place that look like the same problem.
  let timer;
  let lastKey = '';
  const checkSimilar = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const key = [category.value, location.value, description.value.trim()].join('|');
      if (!category.value || !location.value || description.value.trim().length < 8 || key === lastKey) return;
      lastKey = key;
      try {
        const matches = await api('/issues/similar', {
          method: 'POST',
          body: { category: category.value, location: location.value, detail: detail.value, description: description.value },
        });
        similar.replaceChildren(...(matches.length ? [renderMatches(matches)] : []));
      } catch { similar.replaceChildren(); }
    }, 450);
  };

  function renderMatches(matches) {
    return h('div', { class: 'notice' },
      h('strong', {}, 'This may already be reported'),
      h('p', { class: 'hint' }, 'Confirm an existing issue instead of filing a duplicate. Your confirmation raises its priority.'),
      h('ul', {}, matches.map((x) => h('li', {},
        h('a', { href: `#/feed` }, x.title), ` - ${x.report_count} report${x.report_count === 1 ? '' : 's'}, ${x.score}% match `,
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
        }, 'Me too')))));
  }

  for (const el of [category, location, description, detail]) el.addEventListener('input', checkSimilar);

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = '';
      const file = photo.files[0];
      if (file && !PHOTO_TYPES.includes(file.type)) { error.textContent = 'Photo must be a JPG, PNG or WebP image.'; return; }
      if (file && file.size > MAX_PHOTO) { error.textContent = 'Photo must be under 5 MB.'; return; }

      const data = new FormData();
      data.append('category', category.value);
      data.append('location', location.value);
      data.append('detail', detail.value);
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
  h('label', { for: 'location' }, 'Location'), location,
  h('label', { for: 'detail' }, 'Room / spot (optional)'), detail,
  h('label', { for: 'description' }, 'Description'), description,
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
