import { transport, adresseEnvoi, SB_URL, SB_ANON, smtpOk, emailValide, send } from "./send-mail.js";

// Le client a vu son devis et demande à le signer : on lui envoie le lien de signature depuis l'adresse de l'entreprise,
// et on prévient l'entreprise.
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const eur = (v) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(+v || 0);
const n = (v) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(x) ? x : 0; };

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { erreur: "Méthode non autorisée" });
  if (!smtpOk()) return send(res, 501, { ok: false, raison: "smtp" });
  const token = String((req.body || {}).token || "");
  if (!/^[0-9a-f]{32,128}$/.test(token)) return send(res, 400, { erreur: "Lien invalide" });
  const r = await fetch(SB_URL + "/rest/v1/rpc/ite_devis_public", { method: "POST",
    headers: { apikey: SB_ANON, Authorization: "Bearer " + SB_ANON, "Content-Type": "application/json" }, body: JSON.stringify({ p_token: token }) });
  const d = r.ok ? await r.json() : null;
  if (!d) return send(res, 404, { erreur: "Devis introuvable" });
  if (d.signature) return send(res, 409, { erreur: "Ce devis est déjà signé" });
  const c = d.data || {}, dv = c.devis || {}, e = d.entreprise || {};
  if (!emailValide(String(c.email || ""))) return send(res, 422, { ok: false, raison: "email" });
  let ttc = 0; (dv.lignes || []).forEach((l) => { ttc += n(l.qte) * n(l.pu); });
  const reste = ttc - n(c.aideRegion) - (dv.deduireCee ? n(c.cee) : 0);
  const origin = (req.headers["x-forwarded-proto"] || "https") + "://" + req.headers.host;
  const lien = origin + "/?signer=" + token;
  const client = [c.prenom, c.nom].filter(Boolean).join(" ");
  const societe = "Les Compagnons Écologiques Français";
  const adresse = adresseEnvoi(), from = `"${societe}" <${adresse}>`, t = transport();
  const cadre = (titre, corps) => `<div style="background:#f3f6ef;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1d2a17"><table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;border-collapse:separate"><tr><td style="padding:24px 28px">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#2f8f1f;font-weight:bold">${esc(societe)}</p>
    <h1 style="margin:0 0 16px;font-size:20px">${titre}</h1>${corps}
    <p style="margin:24px 0 0;font-size:11px;color:#6b7766">${esc(e.pied1 || "")}<br>${esc(e.pied2 || "")}</p></td></tr></table></div>`;
  try {
    await t.sendMail({ from, to: c.email, replyTo: adresse, subject: `Signature électronique de votre devis ${dv.numero || ""}`,
      html: cadre("Votre lien de signature", `<p>Bonjour ${esc(client)},</p><p>Merci pour votre confiance. Voici le lien pour signer électroniquement votre devis <b>n° ${esc(dv.numero)}</b> (reste à régler : <b>${eur(reste)}</b>).</p>
        <p style="margin:22px 0;text-align:center"><a href="${lien}" style="background:#2f8f1f;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:999px;display:inline-block">Signer mon devis</a></p>
        <p>Il vous suffit de relire le devis, de cocher « Bon pour accord » et de signer au doigt ou à la souris. Aucun compte n'est nécessaire.</p><p>Bien cordialement,<br>${societe}</p>`),
      text: `Bonjour ${client},\nVoici le lien pour signer électroniquement votre devis n° ${dv.numero} : ${lien}\n\n${societe}` });
    await t.sendMail({ from, to: adresse, subject: `${client} demande à signer le devis ${dv.numero || ""}`,
      html: cadre(`Demande de signature : devis ${esc(dv.numero)}`, `<p><b>${esc(client)}</b> a consulté son devis et demandé à le signer. Le lien de signature lui a été envoyé à ${esc(c.email)}.</p><p>Tél. ${esc(c.tel)} · Reste à régler : <b>${eur(reste)}</b></p>`),
      text: `${client} a demandé à signer le devis ${dv.numero}. Lien envoyé à ${c.email}.` }).catch(() => {});
    send(res, 200, { ok: true });
  } catch (err) {
    send(res, 502, { ok: false, erreur: "Envoi impossible : " + (err.message || err) });
  }
}
