import { useI18n } from '../lib/i18n.js';
import CampusMap, { issuePins } from './CampusMap.jsx';

// Where the problem is, on the schematic campus map.
export default function WhereCard({ meta, issue }) {
  const { t } = useI18n();
  return (
    <div className="card">
      <h2>{t('Where')}</h2>
      <p className="muted">{`${issue.location}${issue.detail ? `, ${issue.detail}` : ''}. ${t(issue.pin_x != null ? 'The reporter marked the exact spot.' : 'The exact spot was not marked.')}`}</p>
      <div className="map-wrap">
        <CampusMap meta={meta} label={t('Map showing {place}', { place: issue.location })} place={issue.location} pins={issuePins(meta, [issue], undefined, t)} />
      </div>
    </div>
  );
}
