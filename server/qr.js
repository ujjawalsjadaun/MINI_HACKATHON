import QRCode from 'qrcode';
import { HttpError, requireString, wrap } from './http.js';

// Renders a QR code for a report-form URL. Public on purpose: the code only encodes a link,
// and <img> tags cannot send an Authorization header.
export function qrRoutes(router) {
  router.get('/qr', wrap(async (req, res) => {
    const data = requireString(req.query.data, 'data', { max: 300 });
    if (!/^https?:\/\//i.test(data)) throw new HttpError(400, 'data must be an http(s) link');
    const svg = await QRCode.toString(data, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
  }));
}
