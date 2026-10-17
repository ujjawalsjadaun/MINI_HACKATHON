import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n.js';
import ContactList from './ContactList.jsx';
import { contactsWith, helpTags, isHostelPlace } from '../lib/describe.js';

// Who to call while filing a report: an emergency rating shows the emergency numbers at once,
// and hostel problems the hostel office.
export default function EmergencyHelp({ meta, directory, urgency, category, place }) {
  const { t } = useI18n();
  const hostel = isHostelPlace(meta, place) || category === 'hostel';
  const hostelEntries = hostel ? contactsWith(directory, ['hostel']) : [];
  return (
    <div aria-live="polite">
      {urgency === 'emergency' && (
        <div className="notice emergency-box" role="alert">
          <strong>{t('Someone in danger? Call for help first.')}</strong>
          <p className="hint">{t('This report goes to the maintenance team and may not be read right away. For danger to life, fire or serious injury, call 112 or these contacts now.')}</p>
          <ContactList entries={contactsWith(directory, helpTags({ category, hostel: false, emergency: true }))} />
          <p><Link to="/emergency">{t('All emergency contacts')}</Link></p>
        </div>
      )}
      {hostelEntries.length > 0 && (
        <div className="notice">
          <strong>{t('Hostel contacts')}</strong>
          <p className="hint">{t('Need the hostel office? These contacts can help.')}</p>
          <ContactList entries={hostelEntries} />
        </div>
      )}
    </div>
  );
}
