import QRCode from 'qrcode';
import { authenticate, requireAdmin } from './auth.js';
import { HttpError, requireString, wrap } from './http.js';
import { lanAddresses } from './network.js';

// Renders a QR code for a report-form URL. Public on purpose: the code only encodes a link,
// and <img> tags cannot send an Authorization header.
export function qrRoutes(db, router) {
  // Stickers must point at an address phones can open, never "localhost". Admin-only, because it
  // reveals the server's internal network addresses.
  router.get('/qr/addresses', authenticate(db), requireAdmin, (req, res) => {
    const port = req.socket.localPort;
    res.json({ addresses: lanAddresses().map((a) => ({ ...a, url: `http://${a.address}:${port}` })) });
  });

  router.get('/qr', wrap(async (req, res) => {
    const data = requireString(req.query.data, 'data', { max: 300 });
    if (!/^https?:\/\//i.test(data)) throw new HttpError(400, 'data must be an http(s) link');
    const svg = await QRCode.toString(data, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
  }));
}
