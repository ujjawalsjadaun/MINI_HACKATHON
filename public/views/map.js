import { api, session } from '../api.js';
import { h } from '../dom.js';
import { route } from '../router.js';
import { campusMap, issuePins, PRIORITY_COLOR } from './campus-map.js';
import { emptyState, getMeta } from './shared.js';

export const issueHref = (issue) => `#/${session.user.role === 'student' ? '' : 'admin/'}issue/${issue.id}`;

// Every open problem on the campus map, coloured by priority. Staff only see what is assigned to them.
route('/map', ['student', 'staff', 'admin'], async () => {
  const [m, issues] = await Promise.all([getMeta(api), api('/issues?status=active')]);
  const map = campusMap(m, { label: 'Map of open problems on the campus' });
  map.setPins(issuePins(m, issues, issueHref));

  const count = (label) => issues.filter((i) => i.priority.label === label).length;
  const exact = issues.filter((i) => i.pin_x != null).length;

  return h('section', {},
    h('h1', {}, 'Problem map'),
    h('p', { class: 'muted' }, 'Open problems on the campus. Tap a pin to open it. The map is a drawing, not to scale.'),
    issues.length
      ? [
        h('div', { class: 'legend' }, Object.entries(PRIORITY_COLOR).map(([label, color]) =>
          h('span', { class: 'legend-item' }, h('i', { style: `background:${color}` }), `${label} (${count(label)})`))),
        h('div', { class: 'card' }, h('div', { class: 'map-wrap' }, map.el)),
        h('p', { class: 'hint' }, `${issues.length} open problem${issues.length === 1 ? '' : 's'}. ${exact} marked at an exact spot; faded pins show a problem whose exact spot was not marked, placed inside its building.`),
      ]
      : emptyState('Nothing to show', 'There are no open problems right now.'));
});
