import { useI18n } from '../lib/i18n.js';

// Fills for each campus area, matching the colours of the campus chart.
const GROUP_FILL = {
  Blocks: '#f6b4bb',
  Hostels: '#f8dc8f',
  'Faculty Residence': '#d3c1f4',
  'Other Residence & Facilities': '#b0d0f6',
};

export const PRIORITY_COLOR = { critical: '#b3261e', high: '#d4630a', medium: '#c9a100', low: '#3d6b4f' };

// A map pin whose tip is at (0, 0).
const PIN_PATH = 'M0 0C-6-10-14-17-14-27a14 14 0 1 1 28 0C14-17 6-10 0 0Z';

// Turns issues into map pins. An issue with a dropped pin sits exactly there; one without sits (faded) inside its
// building, spread out so several issues in the same building do not hide each other. Most urgent are drawn last, on top.
export function issuePins(meta, issues, hrefOf, t) {
  const { width: W, height: H } = meta.mapSize;
  const spot = Object.fromEntries(meta.campus.flatMap((g) => g.places.map((p) => [p.name, p.map])));
  const used = new Map();
  return [...issues].sort((a, b) => a.priority.score - b.priority.score).map((issue) => {
    const exact = issue.pin_x != null && issue.pin_y != null;
    let x = issue.pin_x;
    let y = issue.pin_y;
    if (!exact) {
      const b = spot[issue.location];
      const n = used.get(issue.location) ?? 0;
      used.set(issue.location, n + 1);
      x = (b.x + b.w * [0.12, 0.88, 0.3, 0.7][n % 4]) / W; // corners first, so names stay readable
      y = (b.y + b.h - 6 - Math.floor(n / 4) * 10) / H; // along the bottom edge, clear of the name
    }
    return {
      id: issue.id, x, y, approx: !exact, href: hrefOf?.(issue), color: PRIORITY_COLOR[issue.priority.label],
      title: `${issue.title} (${t(issue.priority.label)})${exact ? '' : t(', exact spot not marked, somewhere in {place}', { place: issue.location })}`,
    };
  });
}

// Long names go on two lines, split at the space that keeps the lines most even.
function nameLines(name) {
  const spaces = [...name].flatMap((c, i) => (c === ' ' ? [i] : []));
  if (name.length <= 9 || !spaces.length) return [name];
  const best = spaces.reduce((a, b) => (Math.abs(b - name.length / 2) < Math.abs(a - name.length / 2) ? b : a));
  return [name.slice(0, best), name.slice(best + 1)];
}

const round = (v) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;

function Pin({ x, y, color, title, href, approx = false }) {
  const body = (
    <>
      <path d={PIN_PATH} fill={color} fillOpacity={approx ? 0.6 : 1} stroke="#fff" strokeWidth="2" strokeDasharray={approx ? '4 3' : undefined} />
      <circle cx="0" cy="-27" r="5.5" fill="#fff" />
      {title && <title>{title}</title>}
    </>
  );
  const transform = `translate(${x} ${y})${approx ? ' scale(.72)' : ''}`;
  return href
    ? <a className="map-pin" transform={transform} href={href}>{body}</a>
    : <g className="map-pin" transform={transform}>{body}</g>;
}

// Schematic campus map (a drawing, not a survey, and not to scale). Interactive mode lets a student tap a
// building to pick the place and tap anywhere to drop a pin; read-only mode shows pins for existing issues.
//   place     the highlighted building         pin     the student's own pin {x, y} (0 to 1) or null
//   pins      pins for existing issues         onPick  ({ place, x, y }) when the student taps
export default function CampusMap({ meta, interactive = false, place = '', pin = null, pins = [], onPick, label }) {
  const { t } = useI18n();
  const { width: W, height: H } = meta.mapSize;
  const buildings = meta.campus.flatMap((g) => g.places.map((p) => ({ ...p, group: g.group })));

  const pick = (building, x, y) => onPick?.({ place: building?.name ?? null, x: round(x / W), y: round(y / H) });
  const tapGround = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    pick(null, ((e.clientX - box.left) / box.width) * W, ((e.clientY - box.top) / box.height) * H);
  };

  const zone = (x, y, w, h, title) => (
    <>
      <rect x={x} y={y} width={w} height={h} rx="18" fill="#ffffff" fillOpacity=".45" stroke="#8aa889" strokeDasharray="6 6" />
      <text x={x + 16} y={y + 26} className="map-zone">{title}</text>
    </>
  );

  return (
    <svg className={`campus-map${interactive ? ' interactive' : ''}`} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label ?? t('Schematic campus map, not to scale')} onClick={interactive ? tapGround : undefined}>
      <rect width={W} height={H} fill="#e3f0dc" />
      <rect x="20" y="330" width="950" height="30" rx="8" fill="#c9cdd3" />
      <rect x="606" y="40" width="26" height="290" fill="#c9cdd3" />
      <text x="500" y="352" className="map-road" textAnchor="middle">{t('Campus road')}</text>
      {zone(20, 40, 580, 280, t('Academic area'))}
      {zone(640, 40, 330, 280, t('Hostels'))}
      {zone(20, 370, 950, 240, t('Residences and facilities'))}
      {buildings.map((p) => {
        const { x, y, w, h } = p.map;
        const lines = nameLines(p.name);
        const longest = Math.max(...lines.map((l) => l.length));
        const size = Math.max(12, Math.min(22, (w - 16) / (longest * 0.58)));
        const on = p.name === place;
        const choose = (e) => { e.stopPropagation(); pick(p, x + w / 2, y + h / 2); };
        return (
          <g
            key={p.name}
            className={`map-building${on ? ' on' : ''}`}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `${p.name}${on ? t(', selected') : ''}` : undefined}
            aria-pressed={interactive ? on : undefined}
            onClick={interactive ? choose : undefined}
            onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(e); } } : undefined}
          >
            <rect x={x} y={y} width={w} height={h} rx="10" fill={GROUP_FILL[p.group] ?? '#ddd'} stroke={on ? '#12306b' : '#6b7280'} strokeWidth={on ? 4 : 1.5} />
            <text className="map-name" textAnchor="middle" fontSize={size}>
              {lines.map((line, i) => <tspan key={line} x={x + w / 2} y={y + h / 2 + size * 0.35 + (i - (lines.length - 1) / 2) * size * 1.15}>{line}</tspan>)}
            </text>
          </g>
        );
      })}
      {pins.map((q) => <Pin key={q.id} x={q.x * W} y={q.y * H} color={q.color ?? '#b3261e'} title={q.title} href={q.href} approx={q.approx} />)}
      {pin && <Pin x={pin.x * W} y={pin.y * H} color="#12306b" title={t('Your pin')} />}
    </svg>
  );
}
