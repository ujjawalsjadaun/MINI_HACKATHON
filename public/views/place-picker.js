import { h } from '../dom.js';

const floorLabel = (f) => (f === 'G' ? 'Ground floor' : `Floor ${f}`);
const GROUP_ICONS = { Blocks: '🏛️', Hostels: '🛏️', 'Faculty Residence': '🏡', 'Other Residence & Facilities': '🏥' };

// Interactive campus map: choose a group, then a place, then (where it has floors) a floor.
// Built from radio inputs, so it stays keyboard and screen-reader friendly.
export function placePicker(campus, { onChange } = {}) {
  let group = campus[0];
  let place = '';
  let floor = '';

  const root = h('div', { class: 'picker' });
  const groupBar = h('div', { class: 'seg', role: 'group', 'aria-label': 'Campus area' });
  const placeGrid = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Place' });
  const floorBox = h('div', { class: 'floors', 'aria-live': 'polite' });
  const summary = h('p', { class: 'picker-summary', 'aria-live': 'polite' });

  const emit = () => onChange?.({ place, floor });

  function render() {
    groupBar.replaceChildren(...campus.map((g) => h('button', {
      type: 'button', class: `seg-btn${g === group ? ' on' : ''}`, 'aria-pressed': String(g === group),
      onclick: () => { group = g; render(); },
    }, h('span', { 'aria-hidden': 'true' }, GROUP_ICONS[g.group] ?? '📍'), ` ${g.group}`)));

    placeGrid.replaceChildren(...group.places.map((p) => h('label', { class: `chip${p.name === place ? ' on' : ''}` },
      h('input', {
        type: 'radio', name: 'place', value: p.name, checked: p.name === place,
        onchange: () => { place = p.name; floor = ''; render(); emit(); },
      }), p.name, p.floors.length > 0 && h('small', {}, `${p.floors.length} floors`))));

    const floors = campus.flatMap((g) => g.places).find((p) => p.name === place)?.floors ?? [];
    floorBox.replaceChildren(...(floors.length ? [
      h('span', { class: 'floors-title' }, 'Floor'),
      ...['', ...floors].map((f) => h('label', { class: `chip small${f === floor ? ' on' : ''}` },
        h('input', {
          type: 'radio', name: 'floor', value: f, checked: f === floor,
          onchange: () => { floor = f; render(); emit(); },
        }), f ? floorLabel(f) : 'Not sure')),
    ] : []));

    summary.textContent = place
      ? `Selected: ${place}${floor ? `, ${floorLabel(floor)}` : ''}`
      : 'Pick the area, then the place where the problem is.';
  }

  root.append(groupBar, placeGrid, floorBox, summary);
  render();

  return {
    el: root,
    get place() { return place; },
    get floor() { return floor ? floorLabel(floor) : ''; },
    select(name) {
      const g = campus.find((x) => x.places.some((p) => p.name === name));
      if (!g) return;
      group = g; place = name; floor = ''; render(); emit();
    },
  };
}
