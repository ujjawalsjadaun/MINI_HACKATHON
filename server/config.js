// Single source of truth for categories, routing, locations and statuses.
// `severity` (1-4) feeds the priority score; `department` is the auto-routing target;
// `slaHours` is how long the team has before the issue counts as overdue.
export const CATEGORIES = {
  electrical: { label: 'Electrical (lights, fans, sockets)', department: 'Electrical Maintenance', severity: 3, slaHours: 48 },
  wifi: { label: 'Wi-Fi / Network', department: 'IT Services', severity: 2, slaHours: 48 },
  water: { label: 'Water leakage / Plumbing', department: 'Civil & Plumbing', severity: 3, slaHours: 24 },
  sanitation: { label: 'Sanitation / Cleanliness', department: 'Housekeeping', severity: 3, slaHours: 24 },
  classroom: { label: 'Classroom equipment', department: 'Academic Section', severity: 2, slaHours: 72 },
  hostel: { label: 'Hostel maintenance', department: 'Hostel Warden Office', severity: 2, slaHours: 72 },
  furniture: { label: 'Furniture / Civil damage', department: 'Civil & Plumbing', severity: 1, slaHours: 168 },
  other: { label: 'Other', department: 'Estate Office', severity: 1, slaHours: 168 },
};

// The campus map. `floors` lists the floors a place has (G = ground); empty means no floor choice.
const FLOORS_3 = ['G', '1', '2'];
const FLOORS_4 = ['G', '1', '2', '3'];
const place = (name, floors = []) => ({ name, floors });

export const CAMPUS = [
  {
    group: 'Blocks',
    places: [
      place('B-I', FLOORS_3), place('B-II', FLOORS_3), place('B-III', FLOORS_3), place('B-IV', FLOORS_3),
      place('Central Library', FLOORS_4), place('Administrative Building', FLOORS_4),
    ],
  },
  {
    group: 'Hostels',
    places: [place('Shubhasani', FLOORS_3), place('Lohit-2', FLOORS_4), place('Lohit-1', FLOORS_4), place('Papum', FLOORS_4)],
  },
  { group: 'Faculty Residence', places: [place('Faculty Residence')] },
  {
    group: 'Other Residence & Facilities',
    places: [
      place('NIT Staff Residence'), place('Hospital'), place('Old Library'),
      place('Departmental Store'), place('Post Office'), place('K.V'),
    ],
  },
];

export const LOCATIONS = CAMPUS.flatMap((g) => g.places.map((p) => p.name));
export const FLOORS_OF = Object.fromEntries(CAMPUS.flatMap((g) => g.places.map((p) => [p.name, p.floors])));

// A team can only move an issue to awaiting_confirmation; a reporter confirms it into resolved.
export const STATUSES = ['open', 'assigned', 'in_progress', 'awaiting_confirmation', 'resolved'];
export const ACTIVE_STATUSES = ['open', 'assigned', 'in_progress', 'awaiting_confirmation'];

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
