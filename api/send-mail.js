import nodemailer from "nodemailer";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

// Envoi des e-mails aux clients (simulation et devis) depuis l'adresse de l'entreprise.
// Variables Vercel : SUPABASE_URL, SUPABASE_ANON_KEY (les mêmes que config.js), SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (facultatif).
// Dépendances (package.json) : nodemailer, pdf-lib (PDF joint au devis).

// Adresse et clé publique Supabase : variables Vercel, sinon lues dans config.js (inclus via vercel.json).
function lireConfig() {
  try {
    const t = fs.readFileSync(path.join(process.cwd(), "config.js"), "utf8");
    return { url: (t.match(/url\s*:\s*["']([^"']+)["']/) || [])[1] || "", anon: (t.match(/anonKey\s*:\s*["']([^"']+)["']/) || [])[1] || "" };
  } catch (e) { return { url: "", anon: "" }; }
}
const CFGJS = lireConfig();
const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || CFGJS.url).replace(/\/$/, "");
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || CFGJS.anon;
const manque = () => [["SMTP_HOST", process.env.SMTP_HOST], ["SMTP_USER", process.env.SMTP_USER], ["SMTP_PASS", process.env.SMTP_PASS],
  ["SUPABASE_URL", SB_URL], ["SUPABASE_ANON_KEY", SB_ANON]].filter(([, v]) => !v).map(([k]) => k);
const smtpOk = () => manque().length === 0;
const emailValide = (e) => /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(e);
const send = (res, status, body) => { res.setHeader("Cache-Control", "no-store"); res.status(status).json(body); };

export function transport() {
  const port = +(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: String(process.env.SMTP_USER).trim(), pass: String(process.env.SMTP_PASS).replace(/\s+/g, "") } }); // mot de passe d'application Google : espaces ignorés
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

export const config = { maxDuration: 30 };

// PDF joint au devis : pages envoyées par le CRM (devis + synthèse en images A4), puis les documents joints
// lus dans Supabase avec la session du commercial (mêmes droits que dans le CRM).
const A4 = [595.28, 841.89];
async function construirePdf(pdf, req) {
  const doc = await PDFDocument.create();
  const ajout = async (dataUrl, orient) => {
    const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
    if (!m) return;
    const bytes = Buffer.from(m[2], "base64");
    const img = m[1] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const paysage = orient ? orient === "l" : img.width > img.height;
    const [W, H] = paysage ? [A4[1], A4[0]] : A4;
    const page = doc.addPage([W, H]);
    const k = Math.min(W / img.width, H / img.height), w = img.width * k, h = img.height * k;
    page.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
  };
  for (const p of (Array.isArray(pdf.pages) ? pdf.pages : []).slice(0, 30)) await ajout(p && p.img, p && p.o);
  const ids = (Array.isArray(pdf.annexes) ? pdf.annexes : []).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20);
  if (ids.length) {
    const r = await fetch(SB_URL + "/rest/v1/ite_annexes?select=id,pages&id=in.(" + ids.join(",") + ")",
      { headers: { apikey: SB_ANON, Authorization: req.headers.authorization || "" } });
    const liste = r.ok ? await r.json() : [];
    for (const id of ids) { const a = liste.find((x) => x.id === id); if (a) for (const pg of a.pages || []) await ajout(pg); }
  }
  if (!doc.getPageCount()) return null;
  doc.setTitle(String(pdf.nom || "Devis").replace(/\.pdf$/i, ""));
  return Buffer.from(await doc.save());
}

export default async function handler(req, res) {
  if (req.method === "GET") return send(res, 200, { mail: smtpOk(), from: smtpOk() ? adresseEnvoi() : "", manque: manque() });
  if (req.method !== "POST") return send(res, 405, { erreur: "Méthode non autorisée" });
  if (!smtpOk()) return send(res, 501, { erreur: "Envoi automatique non configuré (variables SMTP et SUPABASE dans Vercel)." });
  const profil = await appelant(req).catch(() => null);
  if (!profil) return send(res, 401, { erreur: "Session expirée : reconnectez-vous." });
  const { to, subject, html, text, fromName, logo, copie, pdf } = req.body || {};
  const dest = String(to || "").trim();
  if (!emailValide(dest)) return send(res, 400, { erreur: "Adresse e-mail du client invalide." });
  if (!html || String(html).length > 300000) return send(res, 400, { erreur: "Message vide ou trop long." });
  const adresse = adresseEnvoi();
  const nom = String(fromName || profil.nom || "").replace(/["<>\r\n]/g, "").trim().slice(0, 80);
  const attachments = [];
  if (typeof logo === "string" && /^data:image\/(png|jpeg);base64,/.test(logo) && logo.length < 400000)
    attachments.push({ filename: "logo.png", path: logo, cid: "logo-cef" });
  if (pdf && typeof pdf === "object") {
    let fichier = null;
    try { fichier = await construirePdf(pdf, req); } catch (e) { return send(res, 500, { erreur: "PDF du devis impossible à créer : " + (e.message || e) }); }
    const nomPdf = String(pdf.nom || "Devis.pdf").replace(/[\\/:*?"<>|\r\n]/g, "").slice(0, 120) || "Devis.pdf";
    if (fichier) attachments.push({ filename: /\.pdf$/i.test(nomPdf) ? nomPdf : nomPdf + ".pdf", content: fichier, contentType: "application/pdf" });
  }
  try {
    await transport().sendMail({
      from: nom ? `"${nom}" <${adresse}>` : adresse,
      to: dest,
      ...(copie === false ? {} : { bcc: adresse }), // copie dans la boîte de l'entreprise, sauf pour les devis
      replyTo: adresse,
      subject: String(subject || "Votre simulation").replace(/[\r\n]/g, " ").slice(0, 200),
      html: String(html), text: String(text || ""), attachments,
    });
    send(res, 200, { ok: true });
  } catch (e) {
    send(res, 502, { erreur: "Le serveur d'envoi a refusé le message : " + (e.message || e) });
  }
}
