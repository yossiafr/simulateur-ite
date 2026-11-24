import { transport, adresseEnvoi, SB_URL, SB_ANON, smtpOk, emailValide, send } from "./send-mail.js";
 
// Après la signature : confirmation au client et avis à l'entreprise, depuis l'adresse de l'entreprise.
// Ne fait rien si le devis n'a pas été signé dans les 15 dernières minutes.
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const eur = (v) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(+v || 0);
const n = (v) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(x) ? x : 0; };
 
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { erreur: "Méthode non autorisée" });
  if (!smtpOk()) return send(res, 200, { ok: false, raison: "smtp" });
  const token = String((req.body || {}).token || "");
  if (!/^[0-9a-f]{32,128}$/.test(token)) return send(res, 400, { erreur: "Lien invalide" });
  const r = await fetch(SB_URL + "/rest/v1/rpc/ite_devis_public", { method: "POST",
    headers: { apikey: SB_ANON, Authorization: "Bearer " + SB_ANON, "Content-Type": "application/json" }, body: JSON.stringify({ p_token: token }) });
  const d = r.ok ? await r.json() : null;
  const s = d && d.signature;
  if (!s || Date.now() - Date.parse(s.date) > 15 * 60 * 1000) return send(res, 200, { ok: false });
  const c = d.data || {}, dv = s.devis || {}, e = d.entreprise || {};
  let ttc = 0; (dv.lignes || []).forEach((l) => { ttc += n(l.qte) * n(l.pu); });
  const reste = ttc - n(c.aideRegion) - (dv.deduireCee ? n(c.cee) : 0);
  const quand = new Date(s.date).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" });
  const origin = (req.headers["x-forwarded-proto"] || "https") + "://" + req.headers.host;
  const lien = origin + "/?signer=" + token;
  const client = [c.prenom, c.nom].filter(Boolean).join(" ");
  const societe = "Les Compagnons Écologiques Français";
  const adresse = adresseEnvoi(), from = `"${societe}" <${adresse}>`, t = transport();
  const cadre = (titre, corps) => `<div style="background:#f3f6ef;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1d2a17"><table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;border-collapse:separate"><tr><td style="padding:24px 28px">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#2f8f1f;font-weight:bold">${esc(e.nomCourt || "C.E.F.")}</p>
    <h1 style="margin:0 0 16px;font-size:20px">${titre}</h1>${corps}
    <p style="margin:24px 0 0;font-size:11px;color:#6b7766">${esc(e.pied1 || "")}<br>${esc(e.pied2 || "")}</p></td></tr></table></div>`;
  const btn = `<p style="margin:20px 0"><a href="${lien}" style="background:#2f8f1f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;display:inline-block">Voir mon devis signé</a></p>`;
  const envois = [];
  if (emailValide(String(c.email || "")))
    envois.push(t.sendMail({ from, to: c.email, replyTo: adresse, subject: `Votre devis ${dv.numero || ""} est signé`,
      html: cadre("Merci, votre devis est signé", `<p>Bonjour ${esc(client)},</p><p>Nous avons bien reçu votre signature du devis <b>n° ${esc(dv.numero)}</b>, le ${esc(quand)}.</p>
        <p>Montant TTC : <b>${eur(ttc)}</b><br>Reste à régler : <b>${eur(reste)}</b></p>${btn}<p>Vous pouvez y enregistrer votre devis signé en PDF. Nous revenons vers vous très vite pour la suite de votre projet.</p><p>Bien cordialement,<br>${societe}</p>`),
      text: `Bonjour ${client},\nNous avons bien reçu votre signature du devis n° ${dv.numero}, le ${quand}.\nMontant TTC : ${eur(ttc)}. Reste à régler : ${eur(reste)}.\nVotre devis signé : ${lien}\n\n${societe}` }));
  envois.push(t.sendMail({ from, to: adresse, subject: `Devis ${dv.numero || ""} signé par ${client}`,
    html: cadre(`Devis ${esc(dv.numero)} signé`, `<p><b>${esc(s.nom)}</b> a signé le devis <b>n° ${esc(dv.numero)}</b> le ${esc(quand)}.</p>
      <p>Client : ${esc(client)}, ${esc([c.adresse, c.cp, c.ville].filter(Boolean).join(" "))}<br>Tél. ${esc(c.tel)} · ${esc(c.email)}</p>
      <p>Montant TTC : <b>${eur(ttc)}</b><br>Reste à régler : <b>${eur(reste)}</b></p><p style="font-size:12px;color:#6b7766">Adresse IP : ${esc(s.ip)} · empreinte ${esc(String(s.empreinte || "").slice(0, 16))}…</p>${btn}`),
    text: `${s.nom} a signé le devis n° ${dv.numero} le ${quand}. Montant TTC ${eur(ttc)}. ${lien}` }));
  const out = await Promise.allSettled(envois);
  send(res, 200, { ok: out.every((x) => x.status === "fulfilled") });
}
 
