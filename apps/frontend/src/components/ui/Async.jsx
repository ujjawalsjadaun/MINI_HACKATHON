import { useI18n } from '../../lib/i18n.js';

// Shows "Loading..." or the error while a page's data is on its way, then renders the page with that data.
export default function Async({ state, children }) {
  const { t } = useI18n();
  if (state.error) {
    return (
      <div className="card">
        <h1>{t('Something went wrong')}</h1>
        <p className="error">{state.error.message}</p>
      </div>
    );
  }
  if (state.loading && state.data === undefined) return <p className="muted">{t('Loading...')}</p>;
  return children(state.data);
}
