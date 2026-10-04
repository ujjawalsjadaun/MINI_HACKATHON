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

// The campus. `floors` lists the floors a place has (G = ground); empty means no floor choice.
// `map` places the building on the schematic map (a 1000 x 640 drawing, not to scale and not surveyed):
// x, y is the top-left corner and w, h the size.
const FLOORS_3 = ['G', '1', '2'];
const FLOORS_4 = ['G', '1', '2', '3'];
const place = (name, floors, map) => ({ name, floors, map });
export const MAP_SIZE = { width: 1000, height: 640 };

export const CAMPUS = [
  {
    group: 'Blocks',
    places: [
      place('B-I', FLOORS_3, { x: 40, y: 80, w: 120, h: 80 }),
      place('B-II', FLOORS_3, { x: 180, y: 80, w: 120, h: 80 }),
      place('B-III', FLOORS_3, { x: 320, y: 80, w: 120, h: 80 }),
      place('B-IV', FLOORS_3, { x: 460, y: 80, w: 120, h: 80 }),
      place('Central Library', FLOORS_4, { x: 40, y: 210, w: 170, h: 90 }),
      place('Administrative Building', FLOORS_4, { x: 240, y: 210, w: 190, h: 90 }),
    ],
  },
  {
    group: 'Hostels',
    places: [
      place('Subansiri', FLOORS_3, { x: 660, y: 80, w: 130, h: 80 }),
      place('Lohit-2', FLOORS_4, { x: 820, y: 80, w: 130, h: 80 }),
      place('Lohit-1', FLOORS_4, { x: 660, y: 200, w: 130, h: 80 }),
      place('Papum', FLOORS_4, { x: 820, y: 200, w: 130, h: 80 }),
    ],
  },
  { group: 'Faculty Residence', places: [place('Faculty Residence', [], { x: 40, y: 410, w: 200, h: 90 })] },
  {
    group: 'Other Residence & Facilities',
    places: [
      place('NIT Staff Residence', [], { x: 280, y: 410, w: 180, h: 90 }),
      place('Hospital', [], { x: 500, y: 410, w: 140, h: 90 }),
      place('Old Library', [], { x: 670, y: 410, w: 130, h: 90 }),
      place('Departmental Store', [], { x: 830, y: 410, w: 130, h: 90 }),
      place('Post Office', [], { x: 500, y: 530, w: 140, h: 70 }),
      place('K.V', [], { x: 670, y: 530, w: 130, h: 70 }),
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

// Chosen at registration; the answer (never the question text alone) is what proves who owns an account.
export const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'In which town or city were you born?',
  'What is the name of your favourite school teacher?',
  'What was the name of your first school?',
  'What was your childhood nickname?',
  'What is the title of your favourite book?',
];

// How urgent the reporter says a problem is. It adds `points` to the priority score; an issue uses the highest
// rating among its reporters (not the sum), so a crowd cannot inflate it.
export const URGENCIES = {
  normal: { points: 0 },
  urgent: { points: 10 },
  emergency: { points: 25 },
};
