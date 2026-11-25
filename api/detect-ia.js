import { appelant, send } from "./send-mail.js";

// Détection automatique des façades et des ouvrants sur une photo (Gemini, vision).
// Même clé que le rendu : GEMINI_API_KEY. GEMINI_VISION_MODEL facultatif. Par défaut gemini-3.5-flash-lite, puis des modèles de secours.
const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || "";
const MODELES = [process.env.GEMINI_VISION_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"].filter(Boolean);
export const config = { maxDuration: 60 };

// Essaie les modèles dans l'ordre : si Google ne connaît pas (ou plus) un modèle pour cette clé, on passe au suivant.
async function appelGemini(modeles, body) {
  let dernier = null;
  for (const mod of modeles) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mod}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { j, mod };
    const msg = (j.error && j.error.message) || "Erreur " + r.status;
    dernier = { status: r.status, msg };
    if (!(r.status === 404 || /not found|not supported|no longer available|deprecated|is not available/i.test(msg))) break;
  }
  return { erreur: dernier };
}


const PROMPT = `Tu analyses la photo d'une maison pour un devis d'isolation thermique par l'extérieur.
Repère :
1. chaque façade (mur extérieur) visible et entière, sous forme de polygone qui suit le contour du mur, pignon compris, sans la toiture ni le soubassement enterré ;
2. chaque ouvrant situé sur ces façades : fenêtre, porte-fenêtre, porte d'entrée, porte de garage (cadre extérieur, volets ouverts exclus).
Réponds uniquement en JSON, coordonnées normalisées de 0 à 1000 au format [y, x] :
{"facades":[{"points":[[y,x],[y,x],...]}],"ouvrants":[{"type":"fenetre|porte-fenetre|porte|garage","box_2d":[ymin,xmin,ymax,xmax]}]}`;

export default async function handler(req, res) {
  if (req.method === "GET") return send(res, 200, { ia: !!KEY, manque: KEY ? [] : ["GEMINI_API_KEY"] });
  if (req.method !== "POST") return send(res, 405, { erreur: "Méthode non autorisée" });
  if (!KEY) return send(res, 501, { erreur: "Détection IA non configurée (GEMINI_API_KEY dans Vercel)." });
  const profil = await appelant(req).catch(() => null);
  if (!profil) return send(res, 401, { erreur: "Session expirée : reconnectez-vous." });
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String((req.body || {}).image || ""));
  if (!m || m[2].length > 3_000_000) return send(res, 400, { erreur: "Photo invalide ou trop lourde." });
  try {
    const { j, erreur } = await appelGemini(MODELES, { contents: [{ parts: [{ inline_data: { mime_type: m[1], data: m[2] } }, { text: PROMPT }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 } });
    if (erreur) return send(res, 502, { erreur: erreur.msg });
    const txt = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || "").join("");
    let out; try { out = JSON.parse(txt.replace(/^```(json)?|```$/g, "").trim()); } catch { return send(res, 502, { erreur: "Réponse de l'IA illisible, réessayez." }); }
    const pt = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => isFinite(v)) ? [Math.max(0, Math.min(1000, +p[0])), Math.max(0, Math.min(1000, +p[1]))] : null;
    const facades = (out.facades || []).map((f) => (f.points || []).map(pt).filter(Boolean)).filter((P) => P.length >= 3).slice(0, 6);
    const ouvrants = (out.ouvrants || []).map((o) => ({ type: String(o.type || "fenetre").slice(0, 20), box: (o.box_2d || []).map(Number) }))
      .filter((o) => o.box.length === 4 && o.box.every(isFinite) && o.box[2] > o.box[0] && o.box[3] > o.box[1]).slice(0, 60);
    send(res, 200, { facades, ouvrants });
  } catch (e) {
    send(res, 502, { erreur: "Service IA injoignable : " + (e.message || e) });
  }
}
