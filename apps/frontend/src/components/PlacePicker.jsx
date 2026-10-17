import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { Segmented } from './ui/index.js';

// The English label is what gets saved with the report (the duplicate matcher reads it); only the shown text is translated.
export const floorName = (f) => (f === 'G' ? 'Ground floor' : `Floor ${f}`);
const GROUP_ICONS = { Blocks: '🏛️', Hostels: '🛏️', 'Faculty Residence': '🏡', 'Other Residence & Facilities': '🏥' };

// Choose a group, then a place, then (where it has floors) a floor. Built from radio inputs, so it stays keyboard
// and screen-reader friendly. The parent owns the choice: `place` and `floor` in, `onChange({ place, floor })` out.
export default function PlacePicker({ campus, place, floor, onChange }) {
  const { t } = useI18n();
  const [groupName, setGroupName] = useState(campus[0].group);
  const floorLabel = (f) => (f === 'G' ? t('Ground floor') : t('Floor {n}', { n: f }));

  // When the place is chosen somewhere else (the map), show its group.
  useEffect(() => {
    const owner = campus.find((g) => g.places.some((p) => p.name === place));
    if (owner) setGroupName(owner.group);
  }, [campus, place]);

  const group = campus.find((g) => g.group === groupName) ?? campus[0];
  const floors = campus.flatMap((g) => g.places).find((p) => p.name === place)?.floors ?? [];

  let summary = t('Pick the area, then the place where the problem is.');
  if (place) summary = floor ? t('Selected: {place}, {floor}', { place, floor: floorLabel(floor) }) : t('Selected: {place}', { place });

  return (
    <div className="picker">
      <Segmented
        label={t('Campus area')}
        value={group.group}
        onChange={setGroupName}
        options={campus.map((g) => ({ value: g.group, icon: GROUP_ICONS[g.group] ?? '📍', text: t(g.group) }))}
      />
      <div className="chips" role="radiogroup" aria-label={t('Place')}>
        {group.places.map((p) => (
          <label key={p.name} className={`chip${p.name === place ? ' on' : ''}`}>
            <input type="radio" name="place" value={p.name} checked={p.name === place} onChange={() => onChange({ place: p.name, floor: '' })} />
            {p.name}{p.floors.length > 0 && <small>{t('{n} floors', { n: p.floors.length })}</small>}
          </label>
        ))}
      </div>
      <div className="floors" aria-live="polite">
        {floors.length > 0 && (
          <>
            <span className="floors-title">{t('Floor')}</span>
            {['', ...floors].map((f) => (
              <label key={f || 'none'} className={`chip small${f === floor ? ' on' : ''}`}>
                <input type="radio" name="floor" value={f} checked={f === floor} onChange={() => onChange({ place, floor: f })} />
                {f ? floorLabel(f) : t('Not sure')}
              </label>
            ))}
          </>
        )}
      </div>
      <p className="picker-summary" aria-live="polite">{summary}</p>
    </div>
  );
}
