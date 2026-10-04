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
  const location = h('select', { id: 'location', required: true },
    h('option', { value: '' }, 'Choose a location'),
    m.campus.map((g) => h('optgroup', { label: g.group }, g.places.map((p) => h('option', { value: p.name }, p.name)))));
  const floor = h('select', { id: 'floor' }, h('option', { value: '' }, 'Choose a place first'));
  floor.disabled = true;
  const floorLabel = (f) => (f === 'G' ? 'Ground floor' : `Floor ${f}`);
  const places = Object.fromEntries(m.campus.flatMap((g) => g.places.map((p) => [p.name, p.floors])));
  const updateFloors = () => {
    const floors = places[location.value] ?? [];
    floor.replaceChildren(
      h('option', { value: '' }, floors.length ? 'Floor (optional)' : 'No floors here'),
      floors.map((f) => h('option', { value: floorLabel(f) }, floorLabel(f))));
    floor.disabled = !floors.length;
  };
  const detail = h('input', { id: 'detail', maxlength: 80, placeholder: 'e.g. room number, near the stairs' });
  const description = h('textarea', { id: 'description', required: true, minlength: 8, maxlength: 600, placeholder: 'What is wrong? Be specific so the right team can fix it.' });
  const photo = h('input', { id: 'photo', type: 'file', accept: PHOTO_TYPES.join(',') });
  const error = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { class: 'primary', type: 'submit' }, 'Submit report');
  const similar = h('div', { 'aria-live': 'polite' });

  // Opened from a QR sticker: location (and room) arrive pre-filled.
  const taggedLocation = m.locations.includes(tag.get('location')) ? tag.get('location') : '';
  if (taggedLocation) location.value = taggedLocation;
  updateFloors();
  if (taggedLocation && tag.get('detail')) detail.value = tag.get('detail').slice(0, 100);

  // As soon as a location is chosen, list what is already open there so the student can
  // join an existing issue ("Me too") instead of filing a duplicate.
  let timer;
  let lastKey = '';
  const checkNearby = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const query = new URLSearchParams({ location: location.value, category: category.value, detail: detail.value, description: description.value });
      const key = query.toString();
      if (!location.value || key === lastKey) return;
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

  location.addEventListener('input', updateFloors);
  for (const el of [category, location, description, detail]) el.addEventListener('input', checkNearby);
  checkNearby();

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
      data.append('detail', [floor.value, detail.value.trim()].filter(Boolean).join(', '));
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
  h('label', { for: 'floor' }, 'Floor'), floor,
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
