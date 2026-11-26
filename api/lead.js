import { transport, adresseEnvoi, SB_URL, smtpOk, emailValide, send } from "./send-mail.js";

// Simulateur de primes public (prime.html) :
//   GET  /api/lead : tarifs CEE et aide région réglés dans Administration (pour que l'estimation suive le CRM)
//   POST /api/lead : crée la fiche du prospect dans le CRM (statut Prospect, attribuée à l'administrateur)
//                    et prévient l'entreprise par e-mail.
// Variable Vercel nécessaire : SUPABASE_SERVICE_ROLE_KEY (la même que pour les rappels).
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const H = () => Object.assign({ apikey: KEY, "Content-Type": "application/json" }, KEY.startsWith("eyJ") ? { Authorization: "Bearer " + KEY } : {});
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const txt = (v, max = 120) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const num = (v, max) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= max ? x : ""; };
const COUL = ["Bleu", "Jaune", "Violet", "Rose"];
const DEF = { ceeBJ: 14, ceeVR: 12, regionM2: 40 };
const fmtTel = (t) => { const d = String(t).replace(/\D/g, ""); return d.length === 10 ? d.replace(/(\d{2})(?=\d)/g, "$1 ").trim() : txt(t, 20); };
const eur = (v) => String(Math.round(v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f") + "\u00a0€";

async function sb(path, opts = {}) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, Object.assign({ headers: H() }, opts));
  if (!r.ok) throw new Error(path.split("?")[0] + " : " + r.status + " " + (await r.text()).slice(0, 200));
  return r.status === 204 ? null : r.json();
}

async function tarifs() {
  if (!KEY || !SB_URL) return DEF;
  try {
    const [cfg] = await sb("ite_config?select=data&id=eq.1");
    const e = (cfg && cfg.data && cfg.data.entreprise) || {};
    const t = {};
    for (const k of Object.keys(DEF)) t[k] = Number(e[k]) > 0 ? Number(e[k]) : DEF[k];
    return t;
  } catch (e) { return DEF; }
}

export default async function handler(req, res) {
  if (req.method === "GET") return send(res, 200, { tarifs: await tarifs(), actif: !!(KEY && SB_URL) });
  if (req.method !== "POST") return send(res, 405, { erreur: "Méthode non autorisée" });
  if (!KEY || !SB_URL) return send(res, 501, { erreur: "Configuration incomplète (SUPABASE_SERVICE_ROLE_KEY)" });
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const c = b.contact || {}, p = b.projet || {};
  if (c.site) return send(res, 200, { ok: true }); // champ piège rempli : robot, on ignore sans le dire
  const nom = txt(c.nom, 60), tel = fmtTel(c.tel), email = txt(c.email, 120);
  if (!nom || String(c.tel || "").replace(/\D/g, "").length < 9) return send(res, 400, { erreur: "Nom et téléphone obligatoires" });
  if (email && !emailValide(email)) return send(res, 400, { erreur: "E-mail invalide" });
  if (!c.rgpd) return send(res, 400, { erreur: "Consentement manquant" });
  const cp = /^\d{5}$/.test(String(p.cp || "")) ? String(p.cp) : "";
  const k = [0, 1, 2, 3].includes(Number(p.couleur)) ? Number(p.couleur) : null;
  const murs = num(p.murs, 5000), cee = num(p.cee, 1e6), region = num(p.region, 1e6);
  try {
    // Fiche attribuée au premier administrateur actif : il la voit et peut la confier à un expert technique.
    const admins = await sb("ite_profiles?select=id&role=eq.admin&actif=is.true&order=created_at&limit=1");
    if (!admins.length) return send(res, 500, { erreur: "Aucun administrateur actif" });
    const now = Date.now(), id = now.toString(36) + Math.random().toString(36).slice(2, 7);
    const notes = [
      "Demande reçue par le simulateur de primes du site le " + new Date(now).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) + ".",
      "Logement : " + (p.type === "appartement" ? "appartement" : "maison") + (p.plus2ans ? ", plus de 2 ans" : ", moins de 2 ans") + ".",
      k != null ? "Foyer " + COUL[k] + " (revenu fiscal déclaré par tranche), " + (num(p.nbPers, 30) || "?") + " personne(s)." : "",
      murs ? "Murs à isoler : " + murs + " m²" + (p.mursEstimes ? " (estimés par le simulateur, à mesurer)" : " (indiqués par le client)") + "." : "",
      cee || region ? "Estimation affichée : prime CEE " + eur(cee) + (region ? " + aide région " + eur(region) : "") + "." : "",
    ].filter(Boolean).join("\n");
    const data = {
      nom, prenom: txt(c.prenom, 60), tel, email, adresse: txt(c.adresse, 160), cp, ville: txt(c.ville, 80), statut: "prospect",
      typeLogement: p.type === "appartement" ? "Appartement" : "Maison individuelle",
      surface: num(p.surface, 2000), surfaceMurs: murs, nbPers: num(p.nbPers, 30),
      source: "simulateur-site", notes, created: now, updated: now,
    };
    await sb("ite_clients", { method: "POST", headers: Object.assign(H(), { Prefer: "return=minimal" }), body: JSON.stringify({ id, owner: admins[0].id, data }) });
    if (smtpOk()) {
      const from = adresseEnvoi();
      const ligne = (a, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#5d6b55">${a}</td><td><b>${esc(v)}</b></td></tr>` : "";
      try {
        await transport().sendMail({ from, to: from, replyTo: email || undefined, subject: "Nouveau prospect (simulateur) : " + [c.prenom, nom].filter(Boolean).join(" "),
          html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1d2a17"><p>Nouvelle demande depuis le simulateur de primes du site. La fiche est créée dans le CRM (statut Prospect).</p><table>${ligne("Nom", [c.prenom, nom].filter(Boolean).join(" "))}${ligne("Téléphone", tel)}${ligne("E-mail", email)}${ligne("Adresse", [c.adresse, cp, c.ville].filter(Boolean).join(" "))}</table><p style="white-space:pre-line">${esc(notes)}</p></div>`,
          text: `Nouvelle demande (simulateur) : ${[c.prenom, nom].filter(Boolean).join(" ")} ${tel} ${email}\n${notes}` });
      } catch (e) { /* la fiche est créée, l'e-mail d'alerte est secondaire */ }
    }
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 500, { erreur: "Enregistrement impossible" });
  }
}
