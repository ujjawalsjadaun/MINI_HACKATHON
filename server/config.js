// Single source of truth for categories, routing, locations and statuses.
// `severity` (1-4) feeds the priority score; `department` is the auto-routing target.
export const CATEGORIES = {
  electrical: { label: 'Electrical (lights, fans, sockets)', department: 'Electrical Maintenance', severity: 3 },
  wifi: { label: 'Wi-Fi / Network', department: 'IT Services', severity: 2 },
  water: { label: 'Water leakage / Plumbing', department: 'Civil & Plumbing', severity: 3 },
  sanitation: { label: 'Sanitation / Cleanliness', department: 'Housekeeping', severity: 3 },
  classroom: { label: 'Classroom equipment', department: 'Academic Section', severity: 2 },
  hostel: { label: 'Hostel maintenance', department: 'Hostel Warden Office', severity: 2 },
  furniture: { label: 'Furniture / Civil damage', department: 'Civil & Plumbing', severity: 1 },
  other: { label: 'Other', department: 'Estate Office', severity: 1 },
};

export const LOCATIONS = [
  'CS Block',
  'Academic Block',
  'Library',
  'Admin Block',
  'Boys Hostel',
  'Girls Hostel',
  'Mess / Canteen',
  'Sports Complex',
  'Campus Road / Outdoor',
];

export const STATUSES = ['open', 'assigned', 'in_progress', 'resolved'];
export const ACTIVE_STATUSES = ['open', 'assigned', 'in_progress'];

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
