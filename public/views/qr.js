import { api } from '../api.js';
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { route } from '../router.js';
import { placePicker } from './place-picker.js';
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

  // A sticker made while the admin is on "localhost" would send every phone to itself. In that case
  // start from this computer's network address instead, and offer the others it found.
  const { addresses } = await api('/qr/addresses').catch(() => ({ addresses: [] }));
  const isLocal = (url) => { try { return /^(localhost|127\.|\[?::1\]?$|0\.0\.0\.0)/.test(new URL(url).hostname); } catch { return false; } };
  const start = isLocal(location.origin) && addresses.length ? addresses[0].url : location.origin;
  const baseInput = h('input', { id: 'base', value: start, inputmode: 'url', list: 'base-options' });
  const baseOptions = h('datalist', { id: 'base-options' }, addresses.map((a) => h('option', { value: a.url }, a.name)));
  const baseWarning = h('div', { 'aria-live': 'polite' });
  const checkBase = () => baseWarning.replaceChildren(...(isLocal(baseInput.value)
    ? [h('p', { class: 'error' }, t('Phones cannot open this address. Choose one of this computer\'s network addresses: {list}', { list: addresses.map((a) => a.url).join(', ') || '-' }))]
    : []));
  checkBase();
  const picker = placePicker(m.campus);
  const roomName = h('input', { id: 'room-name', maxlength: 100, placeholder: t('e.g. CS-101') });
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
      h('img', { src: `/api/qr?data=${encodeURIComponent(url)}`, alt: room ? t('QR code to report an issue at {place}, {room}', { place: loc, room }) : t('QR code to report an issue at {place}', { place: loc }), width: 180, height: 180 }),
      h('figcaption', {}, h('strong', {}, room || loc), room && h('div', {}, loc), h('div', { class: 'hint' }, t('Scan to report an issue'))),
      onRemove && h('button', { class: 'secondary no-print', type: 'button', onclick: onRemove }, t('Remove')));
  };

  const draw = () => stickers.replaceChildren(
    ...m.locations.map((l) => sticker(l, '')),
    ...rooms.map((r, i) => sticker(r.location, r.room, () => { rooms.splice(i, 1); saveRooms(rooms); draw(); })));
  baseInput.addEventListener('change', () => { checkBase(); draw(); });
  draw();

  return h('section', {},
    h('div', { class: 'no-print' },
      h('h1', {}, t('QR location tags')),
      h('p', { class: 'muted' }, t('Print one sticker per place, floor or room. Scanning opens the report form with the exact location filled in, which keeps duplicate detection accurate.')),
      h('div', { class: 'card' },
        h('label', { for: 'base' }, t('Address students will reach this app at')),
        baseInput, baseOptions, baseWarning,
        h('p', { class: 'hint' }, t('Phones cannot open "localhost". Use this computer\'s network address, e.g. http://192.168.1.20:3001, or your deployed URL.')),
        h('h2', { style: 'margin-top:1rem' }, t('Add a room sticker')),
        h('div', { class: 'filters' },
          h('div', { style: 'flex-basis:100%' }, h('span', { class: 'field-label' }, t('Place and floor')), picker.el),
          h('div', {}, h('label', { for: 'room-name' }, t('Room / spot (optional)')), roomName)),
        h('div', { class: 'row' },
          h('button', {
            class: 'primary', type: 'button',
            onclick: () => {
              if (!picker.place) return;
              const room = [picker.floor, roomName.value.trim()].filter(Boolean).join(', ');
              if (!room) return roomName.focus();
              rooms.push({ location: picker.place, room });
              saveRooms(rooms);
              roomName.value = '';
              draw();
            },
          }, t('Add sticker')),
          h('button', { class: 'secondary', type: 'button', onclick: () => window.print() }, t('Print stickers'))))),
    stickers);
});
