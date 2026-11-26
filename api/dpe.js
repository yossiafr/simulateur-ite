import { SB_URL, SB_ANON, send } from "./send-mail.js";

// Infos du logement depuis l'adresse (bouton « 🔎 Infos du logement » de la fiche client).
// Cherche le DPE du client dans les bases publiques, côté serveur (pas de clé à configurer) :
//   1. Base Adresse Nationale (BAN) : position exacte et identifiant de l'adresse.
//   2. ADEME, DPE depuis juillet 2021 (dpe03existant) : par identifiant BAN, puis autour de la position, puis par texte.
//   3. ADEME, DPE d'avant juillet 2021 (dpe-france) : autour de la position, puis par texte.
//   4. BDNB (CSTB, API Open sans clé) : DPE rattaché au bâtiment, puis étiquette ESTIMÉE si le bâtiment n'a aucun DPE.
// Réservé aux utilisateurs connectés au CRM (jeton Supabase de la session).
export const config = { maxDuration: 20 };

const ADEME = "https://data.ademe.fr/data-fair/api/v1/datasets/";
const BDNB = "https://api.bdnb.io/v1/bdnb/donnees/";
const T = 6000;

async function getJson(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), T);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
const essai = async (url) => { try { return await getJson(url); } catch (e) { return null; } };
const enc = encodeURIComponent;

export const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\b(bis|ter)\b/g, "").replace(/[^a-z0-9 ]/g, " ")
  .replace(/\b(rue|r|avenue|av|ave|boulevard|bd|chemin|ch|route|rte|impasse|imp|allee|place|pl|de|du|des|la|le|les|d|l)\b/g, " ")
  .replace(/\s+/g, " ").trim();
// Même adresse ? numéro identique et tous les mots de la voie présents.
export function memeAdresse(cherche, trouve) {
  const a = norm(cherche), b = norm(trouve), num = (a.match(/^\d+/) || [""])[0];
  if (!a || !b) return false;
  if (num && (b.match(/^\d+/) || [""])[0] !== num) return false;
  const mots = a.replace(/^\d+\s*/, "").split(" ").filter((w) => w.length > 1);
  return mots.length > 0 && mots.every((w) => b.includes(w));
}

async function ban(adresse, cp, ville) {
  const q = [adresse, cp, ville].filter(Boolean).join(" ");
  const j = await essai(`https://api-adresse.data.gouv.fr/search/?q=${enc(q)}${/^\d{5}$/.test(cp) ? "&postcode=" + cp : ""}&limit=1`);
  const f = j && j.features && j.features[0];
  if (!f || !(f.properties.score >= 0.5)) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { id: f.properties.id, label: f.properties.label, type: f.properties.type, lon, lat, score: f.properties.score };
}

const SEL21 = "numero_dpe,date_etablissement_dpe,adresse_ban,identifiant_ban,code_postal_ban,nom_commune_ban,etiquette_dpe,annee_construction,periode_construction,surface_habitable_logement,type_batiment,type_energie_principale_chauffage,complement_adresse_logement";
async function ademe2021(c, b) {
  const base = ADEME + "dpe03existant/lines?size=30&select=" + SEL21 + "&sort=-date_etablissement_dpe";
  const lots = [];
  if (b && b.type === "housenumber") lots.push(essai(base + "&qs=" + enc(`identifiant_ban:"${b.id}"`)));
  if (b) lots.push(essai(base + "&geo_distance=" + enc(`${b.lon},${b.lat},40`)));
  // Recherche par texte : seulement les lignes à la même adresse (sinon la rue entière remonterait).
  if (c.adresse) lots.push(essai(base + "&q=" + enc(c.adresse) + "&q_mode=complete" + (c.cp ? "&qs=" + enc(`code_postal_ban:"${c.cp}"`) : ""))
    .then((j) => j && { results: (j.results || []).filter((x) => memeAdresse(c.adresse, x.adresse_ban)) }));
  const rows = (await Promise.all(lots)).flatMap((j) => (j && j.results) || []);
  return rows.map((x) => ({
    source: "ademe2021", numero: x.numero_dpe,
    exact: !!(b && x.identifiant_ban && x.identifiant_ban === b.id) || memeAdresse(c.adresse, x.adresse_ban),
    etiquette: x.etiquette_dpe, date: x.date_etablissement_dpe, adresse: x.adresse_ban, complement: x.complement_adresse_logement,
    annee: x.annee_construction, periode: x.periode_construction, surface: x.surface_habitable_logement,
    typeBat: x.type_batiment, energie: x.type_energie_principale_chauffage,
  }));
}

// Ancienne base (DPE de 2013 à juin 2021, méthode « 3CL 2012 ») : noms de colonnes lus avec prudence.
const pick = (x, ...k) => { for (const n of k) if (x[n] != null && x[n] !== "") return x[n]; return ""; };
async function ademe2012(c, b) {
  const base = ADEME + "dpe-france/lines?size=30";
  const lots = [];
  if (b) lots.push(essai(base + "&geo_distance=" + enc(`${b.lon},${b.lat},40`)));
  if (c.adresse) lots.push(essai(base + "&q=" + enc([c.adresse, c.cp].filter(Boolean).join(" ")))
    .then((j) => j && { results: (j.results || []).filter((x) => memeAdresse(c.adresse, pick(x, "geo_adresse", "adresse_ban", "adresse"))) }));
  const rows = (await Promise.all(lots)).flatMap((j) => (j && j.results) || []);
  return rows.map((x) => {
    const adr = pick(x, "geo_adresse", "adresse_ban", "adresse");
    const cpx = String(pick(x, "code_postal", "code_postal_ban", "tv016_departement_code"));
    return {
      source: "ademe2012", numero: pick(x, "numero_dpe", "_id"), exact: memeAdresse(c.adresse, adr),
      etiquette: pick(x, "classe_consommation_energie", "etiquette_dpe"), date: pick(x, "date_etablissement_dpe", "date_reception_dpe"),
      adresse: adr, annee: pick(x, "annee_construction"), surface: pick(x, "surface_thermique_lot", "surface_habitable"),
      typeBat: pick(x, "tr002_type_batiment_description", "type_batiment"), energie: "", _cp: cpx,
    };
  }).filter((x) => /^[A-G]$/.test(x.etiquette) && (!c.cp || !x._cp || x._cp.length < 5 || x._cp === c.cp));
}

async function bdnb(b) {
  if (!b || b.type !== "housenumber") return [];
  const rel = await essai(BDNB + "rel_batiment_groupe_adresse?cle_interop_adr=eq." + enc(b.id) + "&select=batiment_groupe_id&limit=3");
  const ids = [...new Set((rel || []).map((x) => x.batiment_groupe_id).filter(Boolean))].slice(0, 2);
  const out = [];
  for (const id of ids) {
    const [rep, sim] = await Promise.all([
      essai(BDNB + "batiment_groupe_dpe_representatif_logement?batiment_groupe_id=eq." + enc(id) + "&limit=1"),
      essai(BDNB + "batiment_groupe_simulations_dpe?batiment_groupe_id=eq." + enc(id) + "&limit=1"),
    ]);
    const r = rep && rep[0];
    if (r && /^[A-G]$/.test(r.classe_bilan_dpe || r.classe_conso_energie_arrete_2012 || "")) {
      out.push({
        source: r.arrete_2021 === false ? "ademe2012" : "bdnb", exact: true, numero: r.identifiant_dpe,
        etiquette: r.classe_bilan_dpe || r.classe_conso_energie_arrete_2012, date: r.date_etablissement_dpe || r.date_reception_dpe,
        adresse: b.label, annee: r.annee_construction_dpe, periode: r.periode_construction_dpe, surface: r.surface_habitable_logement,
        typeBat: r.type_batiment_dpe, energie: r.type_energie_chauffage,
      });
    }
    const s = sim && sim[0];
    const e = s && (s.etiquette_dpe_initial_map || "").toUpperCase();
    if (/^[A-G]$/.test(e)) {
      out.push({
        source: "estime", exact: true, etiquette: e, adresse: b.label,
        autre: (s.etiquette_dpe_initial_map_2nd || "").toUpperCase(),
        proba: Number(s.etiquette_dpe_initial_map_prob) || null,
      });
    }
  }
  return out;
}

export async function chercher(c) {
  const b = await ban(c.adresse, c.cp, c.ville);
  const [a21, a12, bd] = await Promise.all([ademe2021(c, b), ademe2012(c, b), bdnb(b)]);
  const vus = new Set(), res = [];
  for (const x of [...a21, ...a12, ...bd]) {
    if (!/^[A-G]$/.test(x.etiquette || "")) continue;
    const k = x.numero ? "n" + x.numero : x.source + x.etiquette + x.adresse;
    if (vus.has(k)) continue; vus.add(k); delete x._cp; res.push(x);
  }
  const rang = { ademe2021: 0, bdnb: 1, ademe2012: 2, estime: 3 };
  res.sort((p, q) => (q.exact - p.exact) || (rang[p.source] - rang[q.source]) || String(q.date || "").localeCompare(String(p.date || "")));
  // Les DPE voisins ne sont gardés que s'il n'y a rien à l'adresse exacte (hors estimation).
  const exacts = res.filter((x) => x.exact && x.source !== "estime");
  const garde = exacts.length ? res.filter((x) => x.exact) : res;
  return { adresse: b ? { label: b.label, id: b.id, trouvee: b.type === "housenumber" } : null, resultats: garde.slice(0, 8) };
}

export default async function handler(req, res) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (req.method === "GET" && !req.query?.adresse) return send(res, 200, { ok: true });
  if (!token || !SB_URL) return send(res, 401, { erreur: "Connexion requise" });
  const u = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SB_ANON, Authorization: "Bearer " + token } }).catch(() => null);
  if (!u || !u.ok) return send(res, 401, { erreur: "Connexion requise" });
  let b = req.method === "POST" ? req.body || {} : req.query || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const c = { adresse: String(b.adresse || "").trim().slice(0, 160), cp: String(b.cp || "").trim().slice(0, 5), ville: String(b.ville || "").trim().slice(0, 80) };
  if (!c.adresse) return send(res, 400, { erreur: "Adresse manquante" });
  try { return send(res, 200, await chercher(c)); }
  catch (e) { return send(res, 502, { erreur: "Bases publiques injoignables" }); }
}
