import { useState } from 'react';
import PlacePicker, { floorName } from '../../components/PlacePicker.jsx';
import { Async } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api, getMeta } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.js';

const STORAGE_KEY = 'campusfix.qr-rooms';

function loadRooms() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; } catch { return []; }
}
function saveRooms(rooms) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms)); } catch { /* storage unavailable */ }
}

// A sticker made while the admin is on "localhost" would send every phone to itself.
const isLocal = (url) => { try { return /^(localhost|127\.|\[?::1\]?$|0\.0\.0\.0)/.test(new URL(url).hostname); } catch { return false; } };

function Sticker({ url, place, room, onRemove }) {
  const { t } = useI18n();
  return (
    <figure className="sticker">
      <img src={`/api/qr?data=${encodeURIComponent(url)}`} alt={room ? t('QR code to report an issue at {place}, {room}', { place, room }) : t('QR code to report an issue at {place}', { place })} width="180" height="180" />
      <figcaption>
        <strong>{room || place}</strong>
        {room && <div>{place}</div>}
        <div className="hint">{t('Scan to report an issue')}</div>
      </figcaption>
      {onRemove && <button className="secondary no-print" type="button" onClick={onRemove}>{t('Remove')}</button>}
    </figure>
  );
}

function QrTagsView({ meta, addresses }) {
  const { t } = useI18n();
  const [rooms, setRooms] = useState(loadRooms);
  // Start from this computer's network address instead of "localhost", and offer the others it found.
  const [base, setBase] = useState(() => (isLocal(window.location.origin) && addresses.length ? addresses[0].url : window.location.origin));
  const [where, setWhere] = useState({ place: '', floor: '' });
  const [roomName, setRoomName] = useState('');

  const tagUrl = (place, room) => {
    const params = new URLSearchParams({ location: place });
    if (room) params.set('detail', room);
    return `${base.trim().replace(/\/+$/, '')}/#/report?${params}`;
  };

  const update = (next) => { setRooms(next); saveRooms(next); };

  function addSticker() {
    if (!where.place) return;
    const room = [where.floor && floorName(where.floor), roomName.trim()].filter(Boolean).join(', ');
    if (!room) { document.getElementById('room-name')?.focus(); return; }
    update([...rooms, { location: where.place, room }]);
    setRoomName('');
  }

  return (
    <section>
      <div className="no-print">
        <h1>{t('QR location tags')}</h1>
        <p className="muted">{t('Print one sticker per place, floor or room. Scanning opens the report form with the exact location filled in, which keeps duplicate detection accurate.')}</p>
        <div className="card">
          <label htmlFor="base">{t('Address students will reach this app at')}</label>
          <input id="base" value={base} inputMode="url" list="base-options" onChange={(e) => setBase(e.target.value)} />
          <datalist id="base-options">{addresses.map((a) => <option key={a.url} value={a.url}>{a.name}</option>)}</datalist>
          <div aria-live="polite">
            {isLocal(base) && <p className="error">{t('Phones cannot open this address. Choose one of this computer\'s network addresses: {list}', { list: addresses.map((a) => a.url).join(', ') || '-' })}</p>}
          </div>
          <p className="hint">{t('Phones cannot open "localhost". Use this computer\'s network address, e.g. http://192.168.1.20:3001, or your deployed URL.')}</p>
          <h2 style={{ marginTop: '1rem' }}>{t('Add a room sticker')}</h2>
          <div className="filters">
            <div style={{ flexBasis: '100%' }}>
              <span className="field-label">{t('Place and floor')}</span>
              <PlacePicker campus={meta.campus} place={where.place} floor={where.floor} onChange={setWhere} />
            </div>
            <div>
              <label htmlFor="room-name">{t('Room / spot (optional)')}</label>
              <input id="room-name" maxLength={100} placeholder={t('e.g. CS-101')} value={roomName} onChange={(e) => setRoomName(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <button className="primary" type="button" onClick={addSticker}>{t('Add sticker')}</button>
            <button className="secondary" type="button" onClick={() => window.print()}>{t('Print stickers')}</button>
          </div>
        </div>
      </div>
      <div className="stickers">
        {meta.locations.map((l) => <Sticker key={l} url={tagUrl(l, '')} place={l} room="" />)}
        {rooms.map((r, i) => <Sticker key={`${r.location}-${r.room}-${i}`} url={tagUrl(r.location, r.room)} place={r.location} room={r.room} onRemove={() => update(rooms.filter((_, j) => j !== i))} />)}
      </div>
    </section>
  );
}

// Admin only: printable QR stickers that open the report form with a place (and room) already filled in.
export default function QrTags() {
  const state = useAsync(async () => {
    const [meta, { addresses }] = await Promise.all([getMeta(), api('/qr/addresses').catch(() => ({ addresses: [] }))]);
    return { meta, addresses };
  }, []);
  return <Async state={state}>{({ meta, addresses }) => <QrTagsView meta={meta} addresses={addresses} />}</Async>;
}
