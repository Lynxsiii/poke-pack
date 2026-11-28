/**
 * Outgoing email. Off until the site has a sender: Noah chose "no email for now"
 * (2026-11-28). Either of these switches it on with no other code change:
 * - a Cloudflare Email Service binding named EMAIL (Workers Paid), or
 * - a RESEND_API_KEY secret (Resend, with poke-pack.rip verified there).
 * MAIL_FROM overrides the sender address.
 */

const FROM = "Poke Pack <no-reply@poke-pack.rip>";

export function mailReady(env) {
  return Boolean(env.EMAIL?.send || env.RESEND_API_KEY);
}

/** true when the provider took the message. */
export async function sendMail(env, { to, subject, text, html }) {
  const from = env.MAIL_FROM || FROM;
  try {
    if (env.EMAIL?.send) {
      await env.EMAIL.send({ to, from, subject, text, html });
      return true;
    }
    if (env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
      });
      return res.ok;
    }
  } catch (err) {
    console.error("sendMail", err);
  }
  return false;
}
