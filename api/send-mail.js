import nodemailer from "nodemailer";

// Envoi des e-mails aux clients (simulation et devis) depuis l'adresse de l'entreprise.
// Variables Vercel : SUPABASE_URL, SUPABASE_ANON_KEY (les mêmes que config.js), SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (facultatif).
// Fichier autonome : n'a besoin que de nodemailer (package.json).

const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const smtpOk = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && SB_URL && SB_ANON);
const emailValide = (e) => /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(e);
const send = (res, status, body) => { res.setHeader("Cache-Control", "no-store"); res.status(status).json(body); };

export function transport() {
  const port = +(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
}
export const adresseEnvoi = () => process.env.SMTP_FROM || process.env.SMTP_USER;
export { SB_URL, SB_ANON, smtpOk, emailValide, send };

// Vérifie la connexion du commercial avec son jeton Supabase (aucune clé secrète nécessaire).
export async function appelant(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const h = { apikey: SB_ANON, Authorization: "Bearer " + token };
  const u = await fetch(SB_URL + "/auth/v1/user", { headers: h });
  if (!u.ok) return null;
  const user = await u.json();
  const p = await fetch(SB_URL + "/rest/v1/ite_profiles?select=*&id=eq." + encodeURIComponent(user.id), { headers: h });
  const [profil] = p.ok ? await p.json() : [];
  return profil && profil.actif && profil.role !== "telepro" ? profil : null;
}

export default async function handler(req, res) {
  if (req.method === "GET") return send(res, 200, { mail: smtpOk(), from: smtpOk() ? adresseEnvoi() : "" });
  if (req.method !== "POST") return send(res, 405, { erreur: "Méthode non autorisée" });
  if (!smtpOk()) return send(res, 501, { erreur: "Envoi automatique non configuré (variables SMTP et SUPABASE dans Vercel)." });
  const profil = await appelant(req).catch(() => null);
  if (!profil) return send(res, 401, { erreur: "Session expirée : reconnectez-vous." });
  const { to, subject, html, text, fromName, logo } = req.body || {};
  const dest = String(to || "").trim();
  if (!emailValide(dest)) return send(res, 400, { erreur: "Adresse e-mail du client invalide." });
  if (!html || String(html).length > 300000) return send(res, 400, { erreur: "Message vide ou trop long." });
  const adresse = adresseEnvoi();
  const nom = String(fromName || profil.nom || "").replace(/["<>\r\n]/g, "").trim().slice(0, 80);
  const attachments = [];
  if (typeof logo === "string" && /^data:image\/(png|jpeg);base64,/.test(logo) && logo.length < 400000)
    attachments.push({ filename: "logo.png", path: logo, cid: "logo-cef" });
  try {
    await transport().sendMail({
      from: nom ? `"${nom}" <${adresse}>` : adresse,
      to: dest,
      bcc: adresse, // copie dans la boîte de l'entreprise
      replyTo: adresse,
      subject: String(subject || "Votre simulation").replace(/[\r\n]/g, " ").slice(0, 200),
      html: String(html), text: String(text || ""), attachments,
    });
    send(res, 200, { ok: true });
  } catch (e) {
    send(res, 502, { erreur: "Le serveur d'envoi a refusé le message : " + (e.message || e) });
  }
}
