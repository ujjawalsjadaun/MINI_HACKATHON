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

// A team can only move an issue to awaiting_confirmation; a reporter confirms it into resolved.
export const STATUSES = ['open', 'assigned', 'in_progress', 'awaiting_confirmation', 'resolved'];
export const ACTIVE_STATUSES = ['open', 'assigned', 'in_progress', 'awaiting_confirmation'];

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
