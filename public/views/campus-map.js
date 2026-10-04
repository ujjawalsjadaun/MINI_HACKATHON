const NS = 'http://www.w3.org/2000/svg';

// Fills for each campus area, matching the colours of the campus chart.
const GROUP_FILL = {
  Blocks: '#f6b4bb',
  Hostels: '#f8dc8f',
  'Faculty Residence': '#d3c1f4',
  'Other Residence & Facilities': '#b0d0f6',
};

const svg = (tag, attrs = {}, ...children) => {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
};

export const PRIORITY_COLOR = { critical: '#b3261e', high: '#d4630a', medium: '#c9a100', low: '#3d6b4f' };

// Turns issues into map pins. An issue with a dropped pin sits exactly there; one without sits (faded) inside its
// building, spread out so several issues in the same building do not hide each other. Most urgent are drawn last, on top.
export function issuePins(meta, issues, hrefOf) {
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
      x, y, approx: !exact, href: hrefOf?.(issue), color: PRIORITY_COLOR[issue.priority.label],
      title: `${issue.title} (${issue.priority.label})${exact ? '' : `, exact spot not marked, somewhere in ${issue.location}`}`,
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

// A map pin whose tip is at (0, 0).
const PIN_PATH = 'M0 0C-6-10-14-17-14-27a14 14 0 1 1 28 0C14-17 6-10 0 0Z';

// Schematic campus map (a drawing, not a survey, and not to scale). Interactive mode lets a student tap a
// building to pick the place and tap anywhere to drop a pin; read-only mode shows pins for existing issues.
export function campusMap(meta, { interactive = false, onPick, label = 'Schematic campus map, not to scale' } = {}) {
  const { width: W, height: H } = meta.mapSize;
  let selected = '';
  let pin = null;
  let pins = [];

  const root = svg('svg', { class: 'campus-map', viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': label });
  const places = meta.campus.flatMap((g) => g.places.map((p) => ({ ...p, group: g.group })));

  const zone = (x, y, w, h, title) => [
    svg('rect', { x, y, width: w, height: h, rx: 18, fill: '#ffffff', 'fill-opacity': '.45', stroke: '#8aa889', 'stroke-dasharray': '6 6' }),
    svg('text', { x: x + 16, y: y + 26, class: 'map-zone' }, title),
  ];

  function pinGraphic(x, y, color, title, href, approx = false) {
    const body = [
      svg('path', { d: PIN_PATH, fill: color, 'fill-opacity': approx ? .6 : 1, stroke: '#fff', 'stroke-width': 2, 'stroke-dasharray': approx ? '4 3' : null }),
      svg('circle', { cx: 0, cy: -27, r: 5.5, fill: '#fff' }),
      title && svg('title', {}, title),
    ];
    const attrs = { class: 'map-pin', transform: `translate(${x} ${y})${approx ? ' scale(.72)' : ''}` };
    return href ? svg('a', { ...attrs, href }, body) : svg('g', attrs, body);
  }

  function draw() {
    root.replaceChildren(...[
      svg('rect', { width: W, height: H, fill: '#e3f0dc' }),
      // Roads
      svg('rect', { x: 20, y: 330, width: 950, height: 30, rx: 8, fill: '#c9cdd3' }),
      svg('rect', { x: 606, y: 40, width: 26, height: 290, fill: '#c9cdd3' }),
      svg('text', { x: 500, y: 352, class: 'map-road', 'text-anchor': 'middle' }, 'Campus road'),
      ...zone(20, 40, 580, 280, 'Academic area'),
      ...zone(640, 40, 330, 280, 'Hostels'),
      ...zone(20, 370, 950, 240, 'Residences and facilities'),
      ...places.map((p) => {
        const { x, y, w, h } = p.map;
        const lines = nameLines(p.name);
        const longest = Math.max(...lines.map((l) => l.length));
        const size = Math.max(12, Math.min(22, (w - 16) / (longest * 0.58)));
        const on = p.name === selected;
        return svg('g', {
          class: `map-building${on ? ' on' : ''}`,
          role: interactive ? 'button' : null,
          tabindex: interactive ? 0 : null,
          'aria-label': interactive ? `${p.name}${on ? ', selected' : ''}` : null,
          'aria-pressed': interactive ? String(on) : null,
          onclick: interactive ? (e) => { e.stopPropagation(); pick(p, x + w / 2, y + h / 2); } : null,
          onkeydown: interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(p, x + w / 2, y + h / 2); } } : null,
        },
        svg('rect', { x, y, width: w, height: h, rx: 10, fill: GROUP_FILL[p.group] ?? '#ddd', stroke: on ? '#12306b' : '#6b7280', 'stroke-width': on ? 4 : 1.5 }),
        svg('text', { class: 'map-name', 'text-anchor': 'middle', 'font-size': size },
          lines.map((line, i) => svg('tspan', { x: x + w / 2, y: y + h / 2 + size * 0.35 + (i - (lines.length - 1) / 2) * size * 1.15 }, line))));
      }),
      ...pins.map((q) => pinGraphic(q.x * W, q.y * H, q.color ?? '#b3261e', q.title, q.href, q.approx)),
      pin && pinGraphic(pin.x * W, pin.y * H, '#12306b', 'Your pin'),
    ].flat().filter(Boolean));
  }

  function pick(place, x, y) {
    pin = { x: round(x / W), y: round(y / H) };
    if (place) selected = place.name;
    draw();
    onPick?.({ place: place?.name ?? null, x: pin.x, y: pin.y });
  }
  const round = (v) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;

  if (interactive) {
    root.classList.add('interactive');
    // Tapping open ground drops a pin without changing the place.
    root.addEventListener('click', (e) => {
      const box = root.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width) * W;
      const y = ((e.clientY - box.top) / box.height) * H;
      pick(null, x, y);
    });
  }

  draw();
  return {
    el: root,
    setPlace(name) { selected = name; draw(); },
    setPin(next) { pin = next; draw(); },
    setPins(next) { pins = next; draw(); },
    get pin() { return pin; },
  };
}
