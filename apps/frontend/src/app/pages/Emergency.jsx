import ContactList from '../../components/ContactList.jsx';
import { Async } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.js';
import { useAuth } from '../AuthContext.jsx';

// The institute's emergency directory. It is fetched fresh each time so a change to the file shows at once.
export default function Emergency() {
  const { t } = useI18n();
  const { user } = useAuth();
  const state = useAsync(() => api('/emergency'), []);
  return (
    <Async state={state}>
      {(directory) => (
        <section>
          <div className="row between">
            <h1>{t('Emergency contacts')}</h1>
            <button className="secondary no-print" type="button" onClick={() => window.print()}>{t('Print this page')}</button>
          </div>
          <div className="notice emergency-box"><strong>{t('In danger right now? Call 112 first, then use the contacts below.')}</strong></div>
          {directory.groups.map((g) => <div className="card" key={g.group}><h2>{t(g.group)}</h2><ContactList entries={g.entries} /></div>)}
          <p className="hint">{t('Keep this directory accessible. For medical or security emergencies during night hours, contact the respective drivers, hostel manager, or security personnel immediately.')}</p>
          {user.role === 'admin' && !directory.configured && (
            <div className="notice no-print">{t('Only the public numbers are shown. Add the full directory in private/emergency-contacts.json (see the README).')}</div>
          )}
        </section>
      )}
    </Async>
  );
}
