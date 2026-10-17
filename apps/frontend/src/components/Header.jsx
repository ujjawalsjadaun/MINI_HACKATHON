import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n.js';

export default function Header() {
  const { t } = useI18n();
  return (
    <>
      <div className="utility no-print">
        <span>{t('Hackathon Arunachal 2026 · Campus Issue Management demo')}</span>
        <span>{t('A student project — not an official NIT Arunachal Pradesh service')}</span>
      </div>
      <header className="topbar no-print">
        <div className="masthead">
          <a className="logo-plate" href="https://www.nitap.ac.in" target="_blank" rel="noopener noreferrer" aria-label={t('NIT Arunachal Pradesh website (opens in a new tab)')}>
            <img src="/assets/nitap-logo.png" width="600" height="85" alt="National Institute of Technology Arunachal Pradesh" />
          </a>
          <Link className="portal-name" to="/">
            <span className="portal-title">UniSeva Portal</span>
            <span className="portal">{t('Campus Issue Management Portal')}</span>
          </Link>
        </div>
      </header>
    </>
  );
}
