import { api } from '../api.js';
import { h } from '../dom.js';
import { route } from '../router.js';
import { getMeta } from './shared.js';

const STORAGE_KEY = 'campusfix.qr-rooms';

function loadRooms() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; } catch { return []; }
}
function saveRooms(rooms) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms)); } catch { /* storage unavailable */ }
}

route('/admin/qr', ['admin'], async () => {
  const m = await getMeta(api);
  let rooms = loadRooms();

  const baseInput = h('input', { id: 'base', value: location.origin, inputmode: 'url' });
  const roomLocation = h('select', { id: 'room-location' }, m.locations.map((l) => h('option', { value: l }, l)));
  const roomName = h('input', { id: 'room-name', maxlength: 100, placeholder: 'e.g. CS-101' });
  const stickers = h('div', { class: 'stickers' });

  const tagUrl = (loc, room) => {
    const base = baseInput.value.trim().replace(/\/+$/, '');
    const params = new URLSearchParams({ location: loc });
    if (room) params.set('detail', room);
    return `${base}/#/report?${params}`;
  };

  const sticker = (loc, room, onRemove) => {
    const url = tagUrl(loc, room);
    return h('figure', { class: 'sticker' },
      h('img', { src: `/api/qr?data=${encodeURIComponent(url)}`, alt: `QR code to report an issue at ${loc}${room ? `, ${room}` : ''}`, width: 180, height: 180 }),
      h('figcaption', {}, h('strong', {}, room || loc), room && h('div', {}, loc), h('div', { class: 'hint' }, 'Scan to report an issue')),
      onRemove && h('button', { class: 'secondary no-print', type: 'button', onclick: onRemove }, 'Remove'));
  };

  const draw = () => stickers.replaceChildren(
    ...m.locations.map((l) => sticker(l, '')),
    ...rooms.map((r, i) => sticker(r.location, r.room, () => { rooms.splice(i, 1); saveRooms(rooms); draw(); })));
  baseInput.addEventListener('change', draw);
  draw();

  return h('section', {},
    h('div', { class: 'no-print' },
      h('h1', {}, 'QR location tags'),
      h('p', { class: 'muted' }, 'Print one sticker per block or room. Scanning opens the report form with the exact location filled in, which keeps duplicate detection accurate.'),
      h('div', { class: 'card' },
        h('label', { for: 'base' }, 'Address students will reach this app at'),
        baseInput,
        h('p', { class: 'hint' }, 'Phones cannot open "localhost". Use this computer\'s network address, e.g. http://192.168.1.20:3001, or your deployed URL.'),
        h('h2', { style: 'margin-top:1rem' }, 'Add a room sticker'),
        h('div', { class: 'filters' },
          h('div', {}, h('label', { for: 'room-location' }, 'Block'), roomLocation),
          h('div', {}, h('label', { for: 'room-name' }, 'Room / spot'), roomName)),
        h('div', { class: 'row' },
          h('button', {
            class: 'primary', type: 'button',
            onclick: () => {
              const room = roomName.value.trim();
              if (!room) return roomName.focus();
              rooms.push({ location: roomLocation.value, room });
              saveRooms(rooms);
              roomName.value = '';
              draw();
            },
          }, 'Add sticker'),
          h('button', { class: 'secondary', type: 'button', onclick: () => window.print() }, 'Print stickers')))),
    stickers);
});
