import nodemailer from 'nodemailer';

// Sends real email when SMTP is configured through environment variables (see README):
//   SMTP_HOST, SMTP_USER, SMTP_PASS, and optionally SMTP_PORT (default 587) and SMTP_FROM.
// Without them it runs in demo mode: the message is printed in the server console instead, and `delivers`
// is false so the interface can say so honestly rather than claim an email was sent.
export function createMailer({ env = process.env, transport } = {}) {
  const configured = Boolean(transport || (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS));
  const port = Number(env.SMTP_PORT) || 587;
  const smtp = transport ?? (configured && nodemailer.createTransport({
    host: env.SMTP_HOST, port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  }));
  const from = env.SMTP_FROM || `CampusFix <${env.SMTP_USER}>`;

  return {
    delivers: configured,
    async send({ to, subject, text }) {
      if (!smtp) {
        console.log(`\n[demo mode: SMTP is not configured, so this email is shown here instead of being sent]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
        return;
      }
      await smtp.sendMail({ from, to, subject, text });
    },
  };
}
