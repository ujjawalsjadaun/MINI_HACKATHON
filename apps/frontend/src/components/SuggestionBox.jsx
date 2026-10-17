import { useI18n } from '../lib/i18n.js';

// The assistant's suggested category and clearer wording. The student decides what to use.
export default function SuggestionBox({ meta, suggestion: s, onUse, onDismiss }) {
  const { t } = useI18n();
  const label = t(meta.categories.find((c) => c.key === s.category)?.label ?? s.category);
  // The server explains its choice in English ("Matched \"leak\", \"pipe\""); the matched words stay as they were.
  const reason = s.reason.startsWith('Matched ') ? t('Matched {words}', { words: s.reason.slice(8) }) : t(s.reason);
  return (
    <div className={`notice ai-box${s.urgent ? ' urgent' : ''}`}>
      <strong>{t('✨ Suggestion ({source})', { source: t(s.source) })}</strong>
      {s.urgent && <p className="error">{t('This looks like a safety hazard. Keep away from it and tell a staff member if it is dangerous right now.')}</p>}
      <p><strong>{t('Category: ')}</strong>{label}<span className="hint">{` - ${reason}`}</span></p>
      <p><strong>{t('Clearer description: ')}</strong>{s.description}</p>
      <div className="row">
        <button className="primary" type="button" onClick={onUse}>{t('Use this')}</button>
        <button className="secondary" type="button" onClick={onDismiss}>{t('Keep mine')}</button>
      </div>
      <p className="hint">{t('Suggestions can be wrong. You decide what gets submitted.')}</p>
    </div>
  );
}
