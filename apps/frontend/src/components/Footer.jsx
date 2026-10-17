import { useI18n } from '../lib/i18n.js';

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="sitefooter no-print">
      <p>{t('Report it. Track it. See it fixed.')}</p>
      <p className="developer">{t('Designed and developed by')} <strong>Ujjawal Singh</strong> {t('and')} <strong>Anirudh Mishra</strong> &copy; 2026</p>
      <p>{t('Built for Hackathon Arunachal 2026 by students. Not an official service of NIT Arunachal Pradesh.')}</p>
      <p>{t('Host institute: National Institute of Technology Arunachal Pradesh, Jote, Papum Pare, Arunachal Pradesh - 791113 ·')} <a href="https://www.nitap.ac.in" target="_blank" rel="noopener noreferrer">www.nitap.ac.in</a></p>
      <p>{t('Background photo of Academic Block III, property of NIT Arunachal Pradesh. Source:')} <a href="https://www.nitap.ac.in" target="_blank" rel="noopener noreferrer">www.nitap.ac.in</a></p>
    </footer>
  );
}
