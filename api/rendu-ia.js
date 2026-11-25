import { appelant, send, SB_URL } from "./send-mail.js";

// Rendu réaliste du crépi par l'IA de Google (Gemini, retouche d'image).
// Variables Vercel : GEMINI_API_KEY (clé Google AI Studio), et SUPABASE_URL / SUPABASE_ANON_KEY (déjà utilisées pour les e-mails).
// GEMINI_MODEL facultatif (par défaut gemini-2.5-flash-image).
const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-image";
const okConf = () => !!(KEY && SB_URL);

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method === "GET") return send(res, 200, { ia: okConf() });
  if (req.method !== "POST") return send(res, 405, { erreur: "Méthode non autorisée" });
  if (!okConf()) return send(res, 501, { erreur: "Rendu IA non configuré (GEMINI_API_KEY dans Vercel)." });
  const profil = await appelant(req).catch(() => null);
  if (!profil) return send(res, 401, { erreur: "Session expirée : reconnectez-vous." });
  const { image, couleur, nom } = req.body || {};
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(image || ""));
  if (!m || m[2].length > 3_000_000) return send(res, 400, { erreur: "Photo invalide ou trop lourde." });
  const hex = /^#[0-9a-f]{6}$/i.test(String(couleur)) ? couleur : "#d9cdb4";
  const teinte = String(nom || "enduit").replace(/[^\p{L}\p{N} '-]/gu, "").slice(0, 40);
  const prompt = `Photo d'une maison avant isolation thermique par l'extérieur. Retouche cette photo pour montrer la maison après travaux : `
    + `applique un enduit de façade (crépi) taloché fin, de teinte « ${teinte} » (couleur ${hex}), uniformément sur tous les murs extérieurs visibles. `
    + `Ne change rien d'autre : fenêtres, portes, volets, appuis, toiture, gouttières, végétation, ciel, véhicules, cadrage, perspective et lumière restent identiques. `
    + `Rendu photoréaliste, sans texte ni logo.`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
        generationConfig: { responseModalities: ["IMAGE"] } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return send(res, 502, { erreur: (j.error && j.error.message) || "Erreur " + r.status });
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const img = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data);
    if (!img) return send(res, 502, { erreur: "L'IA n'a pas renvoyé d'image, réessayez." });
    send(res, 200, { image: `data:${img.mimeType || img.mime_type || "image/png"};base64,${img.data}` });
  } catch (e) {
    send(res, 502, { erreur: "Service IA injoignable : " + (e.message || e) });
  }
}
