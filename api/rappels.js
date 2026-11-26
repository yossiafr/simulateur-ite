import { transport, adresseEnvoi, SB_URL, smtpOk, emailValide, send } from "./send-mail.js";

// Rappel automatique envoyé au client la veille de son RDV (lancé chaque jour par Vercel Cron, voir vercel.json).
// Variables Vercel en plus de celles de send-mail.js :
//   SUPABASE_SERVICE_ROLE_KEY : clé secrète Supabase (Project Settings > API), à ne jamais mettre dans config.js
//   CRON_SECRET : un mot de passe au choix ; Vercel l'envoie automatiquement à chaque lancement.
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Ancienne clé service_role (eyJ…) : en-têtes apikey + Authorization ; nouvelle clé secrète (sb_secret_…) : en-tête apikey seul.
const H = () => Object.assign({ apikey: KEY, "Content-Type": "application/json" }, KEY.startsWith("eyJ") ? { Authorization: "Bearer " + KEY } : {});
const jourParis = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
const heure = (d) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d);
const dateLongue = (d) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d);

async function get(path) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, { headers: H() });
  if (!r.ok) throw new Error(path.split("?")[0] + " : " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== "Bearer " + secret) return send(res, 401, { erreur: "Non autorisé" });
  if (!KEY || !smtpOk()) return send(res, 501, { erreur: "Configuration incomplète (SUPABASE_SERVICE_ROLE_KEY ou SMTP)" });
  try {
    const now = new Date(), demain = jourParis(new Date(now.getTime() + 864e5));
    const de = new Date(now.getTime() + 2 * 3600e3).toISOString(), a = new Date(now.getTime() + 54 * 3600e3).toISOString();
    const rdvs = (await get(`ite_rdv?select=*&commercial=not.is.null&resultat=eq.a_venir&rappel_envoye=is.null&debut=gte.${de}&debut=lt.${a}&order=debut`))
      .filter((r) => jourParis(new Date(r.debut)) === demain && r.client_id);
    if (!rdvs.length) return send(res, 200, { ok: true, envoyes: 0, demain });
    const ids = (l) => [...new Set(l)].map((x) => `"${x}"`).join(",");
    const [clients, profils, cfg] = await Promise.all([
      get(`ite_clients?select=id,data&id=in.(${ids(rdvs.map((r) => r.client_id))})`),
      get(`ite_profiles?select=id,nom,email&id=in.(${ids(rdvs.map((r) => r.commercial))})`),
      get("ite_config?select=data&id=eq.1"),
    ]);
    const e = ((cfg[0] || {}).data || {}).entreprise || {};
    const societe = "Les Compagnons Écologiques Français", adresse = adresseEnvoi(), from = `"${societe}" <${adresse}>`, t = transport();
    let envoyes = 0, sansEmail = 0, erreurs = [];
    for (const r of rdvs) {
      const c = (clients.find((x) => x.id === r.client_id) || {}).data || {};
      if (!emailValide(String(c.email || ""))) { sansEmail++; continue; }
      const com = profils.find((p) => p.id === r.commercial) || {}, d = new Date(r.debut);
      const client = [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ") || "Madame, Monsieur";
      const lieu = [c.adresse, [c.cp, c.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || r.adresse;
      const html = `<div style="background:#f3f6ef;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1d2a17"><table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;border-collapse:separate"><tr><td style="padding:24px 28px">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#2f8f1f;font-weight:bold">${esc(societe)}</p>
        <h1 style="margin:0 0 16px;font-size:20px">Rappel : votre rendez-vous de demain</h1>
        <p>Bonjour ${esc(client)},</p>
        <p>Nous vous rappelons votre rendez-vous pour votre projet d'isolation thermique par l'extérieur :</p>
        <table role="presentation" style="margin:14px 0;background:#eef5e6;border-radius:10px;width:100%"><tr><td style="padding:14px 18px;font-size:15px;line-height:1.6">
          📅 <b>${esc(dateLongue(d))} à ${esc(heure(d))}</b><br>📍 ${esc(lieu)}<br>👤 Votre expert technique : <b>${esc(com.nom || "")}</b></td></tr></table>
        <p>Pour que l'étude soit complète, merci de préparer si possible votre dernier avis d'imposition, une facture de chauffage et votre taxe foncière.</p>
        <p>Un empêchement ? Répondez simplement à cet e-mail pour décaler le rendez-vous.</p>
        <p>À demain,<br>${esc(societe)}</p>
        <p style="margin:24px 0 0;font-size:11px;color:#6b7766">${esc(e.pied1 || "")}<br>${esc(e.pied2 || "")}</p></td></tr></table></div>`;
      try {
        await t.sendMail({ from, to: c.email, replyTo: adresse, subject: `Rappel : votre rendez-vous du ${dateLongue(d)} à ${heure(d)}`, html,
          text: `Bonjour ${client},\nRappel de votre rendez-vous le ${dateLongue(d)} à ${heure(d)}, ${lieu}, avec ${com.nom || "votre expert technique"}.\nUn empêchement ? Répondez à cet e-mail.\n${societe}` });
        await fetch(SB_URL + "/rest/v1/ite_rdv?id=eq." + r.id, { method: "PATCH", headers: H(), body: JSON.stringify({ rappel_envoye: new Date().toISOString() }) });
        envoyes++;
      } catch (err) { erreurs.push(String(err.message || err)); }
    }
    send(res, 200, { ok: true, demain, envoyes, sansEmail, erreurs });
  } catch (err) {
    send(res, 500, { erreur: String(err.message || err) });
  }
}
