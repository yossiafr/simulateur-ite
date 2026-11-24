# Simulateur d'autofinancement ITE

Mini-CRM pour les commerciaux en isolation thermique par l'extérieur. On saisit le client, son logement et sa facture de chauffage. L'appli calcule la mensualité du crédit, les économies, les aides (CEE, aide région), la plus-value estimée et le pourcentage du projet couvert. Elle produit une synthèse imprimable et un e-mail mis en page pour le client.

Technique : page web unique (`index.html`), base et connexions Supabase, hébergement Vercel. Trois fonctions serveur facultatives dans `api/`.

## Règles de calcul

1. **Mensualité** : crédit à mensualités constantes sur le montant des travaux, au taux annuel saisi (6 % par défaut). Les intérêts du différé (6 mois par défaut) s'ajoutent au capital. La mensualité peut être saisie à la main.
2. **Économie mensuelle** : facture de chauffage annuelle × taux d'économie (25 % par défaut) ÷ 12, ou saisie à la main.
3. **Économie globale** : économie mensuelle × (différé + durée), avec une hausse annuelle de l'énergie facultative.
4. **Plus-value** : valeur du bien × 10 % (Notaires de France, transactions 2024), réalisable à la revente.
5. **Projet couvert** : (économies + CEE + aide région + plus-value) ÷ total remboursé, affiché jusqu'à 100 %. La part « économies + aides » est affichée à part.

Les valeurs par défaut se règlent dans l'onglet Administration.

## Foyer et revenus

Sur la fiche client : revenu fiscal de référence, nombre de personnes du foyer, revenus nets mensuels et statut de Monsieur et de Madame (salarié CDI, CDD, à son compte, retraité…), crédits en cours (type, mensualité, date de fin). La couleur du foyer MaPrimeRénov' (bleu, jaune, violet, rose) est calculée automatiquement avec le barème 2026 : Île-de-France si le code postal commence par 75, 77, 78, 91, 92, 93, 94 ou 95, sinon barème hors Île-de-France. Le taux d'endettement (crédits ÷ revenus, puis avec la mensualité du projet) s'affiche sous les crédits. La couleur apparaît aussi dans la liste des clients et sur les RDV de l'agenda.

Prime CEE calculée automatiquement : surface de murs à isoler × 14 €/m² pour les foyers bleu et jaune, × 12 €/m² pour les foyers violet et rose (tarifs modifiables dans Administration › Tarifs de base). Saisir un montant dans le champ Prime CEE force une autre valeur ; le vider revient au calcul automatique.

## Devis

Onglet « Devis » de chaque fiche : crée un devis ITE (opération BAR-EN-102) pré-rempli avec les coordonnées du client, la surface de murs et 3 lignes (prestations administratives, isolant, main d'œuvre). Lignes, prix, textes et TVA sont modifiables. Le total TTC devient le montant des travaux de la simulation ; les aides région sont déduites du reste à régler, la prime CEE figure dans les termes CEE. « Imprimer / PDF du devis » produit un A4 avec en-tête et pied de page légal sur chaque page. Les informations de l'entreprise (RGE, SIRET, pied de page, tarifs, prochain numéro) se règlent dans « Réglages de l'entreprise » en bas de l'onglet (administrateur).

### Options du devis
Onglet Administration › « Options du devis » : catalogue des prestations en plus (crépi sur murs non isolés, déport des gonds, dépose et repose de store banne…), avec descriptif, unité, prix TTC et TVA. Sur chaque devis, la liste « + Ajouter une option… » ajoute la ligne, modifiable ensuite.

### Documents joints
Onglet Administration › « Documents joints au devis » : ajouter des PDF ou images (fiche produit, attestation RGE, assurance décennale). Ils s'impriment à la suite du devis, dans l'ordre choisi, et sont montrés au client sur la page de signature. Sur un devis, on peut décocher un document.

### Signature électronique simple (gratuite)
Dans l'onglet Devis : « Créer le lien de signature », puis copier le lien ou l'envoyer par e-mail. Le client ouvre le lien sans compte, lit le devis et les documents, coche « Bon pour accord » et signe au doigt ou à la souris. Sont enregistrés : nom, image de la signature, date et heure, adresse IP, navigateur, empreinte SHA-256 et copie du devis signé. La fiche passe en « Signé » et le devis n'est plus modifiable ; seul un administrateur peut annuler une signature. Ce n'est pas une signature certifiée (eIDAS avancée ou qualifiée).

Projet déjà en ligne : exécuter une fois `mise-a-jour-devis.sql` dans Supabase › SQL Editor (sans risque si on le relance).

## Photos et métrage

Onglet « Photos & métrage » de chaque fiche : prendre la maison en photo depuis le téléphone (ou choisir une photo). Sur la photo : 1) placer une mesure connue (hauteur de porte ≈ 2,15 m, ou une longueur mesurée), 2) entourer chaque façade, 3) chaque fenêtre ou porte. L'appli donne la surface avec et sans ouvrants, et la reporte dans la fiche et le devis. Le bouton « Appliquer le crépi » colore les façades dans la teinte choisie (gratuit). Détection automatique des façades et ouvrants et rendu réaliste par IA (facultatifs) : ajouter `api/detect-ia.js`, `api/rendu-ia.js` et la variable Vercel `GEMINI_API_KEY` (clé créée sur aistudio.google.com, facturation Google activée, environ 4 centimes par image). Projet déjà en ligne : relancer `mise-a-jour-devis.sql` (section 9, table des photos).

### Street View (onglet Carte)
Sans réglage, l'onglet Carte utilise la vue Street View publique de Google. Si elle reste vide, créez une clé gratuite « Maps Embed API » dans Google Cloud (restreinte à l'adresse du site) et ajoutez-la dans `config.js` : `mapsKey: "..."`.

## Droits

| | Télépro | Commercial | Admin |
|---|---|---|---|
| Créer un client et voir ses propres clients | oui (identité et logement) | oui | oui |
| Financement, aides, synthèse, photos, devis, e-mails | non | oui | oui |
| Carte et agenda | oui | oui | oui |
| Placer un RDV | oui, sans choisir le commercial | oui, pour lui | oui, pour qui il veut |
| Voir les RDV des autres | créneaux des autres télépros en gris, code postal et ville seulement | non | oui |
| Confirmer un RDV de télépro et choisir le commercial | non | non | oui |
| Voir et modifier les clients des autres | non | non | oui |
| Réattribuer ou supprimer une fiche | non | non | oui |
| Gérer les comptes et les réglages | non | non | oui |

Un RDV pris par un télépro reste « À confirmer » (pointillés dans l'agenda de l'admin, bandeau « RDV à confirmer »). L'admin l'ouvre, choisit le commercial et clique « Confirmer le RDV » : le RDV passe dans l'agenda du commercial et la fiche client lui est attribuée. Le télépro voit alors son RDV « Confirmé », sans pouvoir le modifier.

Fiche RDV en PDF (admin) : dans un RDV, bouton « 📄 Fiche RDV (PDF) ». Une page A4 avec en tête le commercial, la date et l'heure, puis le client, ses coordonnées, le logement, le foyer fiscal et sa couleur, les revenus et crédits, le commentaire du RDV et les notes. La note en étoiles n'y figure pas, pour pouvoir la remettre au commercial. Dans la fenêtre d'impression, choisir « Enregistrer au format PDF ».

En prenant un RDV, le bouton « Proposer les meilleurs créneaux » cherche sur les deux semaines suivantes les créneaux libres les plus proches des RDV déjà placés (distance estimée par la route : vol d'oiseau × 1,3, 55 km/h de moyenne, temps de trajet réservé entre deux RDV). Les adresses sont localisées avec la Base Adresse Nationale (gratuite). Le télépro note le RDV de 1 étoile (pas terrible) à 4 étoiles (très bon). La note n'est visible que par l'admin et le télépro qui a pris le RDV, jamais par le commercial (table séparée protégée par la base).

Ces droits sont appliqués par la base elle-même (Row Level Security), pas seulement par l'écran.

## Mise en ligne (environ 20 minutes)

Tous les fichiers utiles sont à la racine : `index.html`, `config.js`, `supabase-2.119.0.js` et `supabase/schema.sql`. Ils s'envoient sur GitHub avec « Add file › Upload files », sans dossier à glisser.

1. **Supabase** (supabase.com, offre gratuite) : créer un nouveau projet, région Europe (Paris ou Francfort).
   - SQL Editor › New query : coller le contenu de `schema.sql`, puis Run.
   - Authentication › Sign In / Providers : désactiver « Allow new users to sign up ».
   - Authentication › Users › Add user › Create new user : votre e-mail et un mot de passe, cocher « Auto Confirm User ». **Ce premier compte devient administrateur.**
   - Project Settings › API (ou « Data API ») : copier l'URL du projet et la clé `anon` (publique).
2. **GitHub** : dans `config.js`, remplacer l'adresse et la clé par celles du projet (crayon « Edit » sur GitHub, puis « Commit changes »). Ne jamais y mettre la clé `service_role`.
3. **Vercel** (vercel.com) : Add New › Project › importer le dépôt GitHub. Framework Preset : **Other**. Aucune variable à saisir. Deploy.
4. **Retour dans Supabase** › Authentication › URL Configuration : mettre l'adresse du site Vercel (par exemple `https://simulateur-ite.vercel.app`) dans « Site URL ». C'est l'adresse du lien « mot de passe oublié ».
5. Se connecter avec le compte administrateur, vérifier les réglages par défaut (onglet Administration).

### Ajouter un commercial ou un télépro

Dans Supabase › Authentication › Users › Add user › Create new user : son e-mail et un mot de passe provisoire, cocher « Auto Confirm User ». Dans l'appli, onglet Administration : il apparaît désactivé. Saisir son nom, choisir son rôle (Commercial, Télépro ou Admin), cocher « Actif », puis lui communiquer son e-mail et son mot de passe. Il peut le changer avec « Mot de passe oublié ».

### Version complète (facultatif)

Le dossier `api/` ajoute trois fonctions Vercel : création des comptes et changement de mot de passe depuis l'appli, et envoi direct des e-mails. Pour l'utiliser, laissez `config.js` vide (ou supprimez-le) et ajoutez dans Vercel › Settings › Environment Variables : `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` (secrète), puis redéployez.

## Envoi des devis par e-mail depuis contact@ (recommandé)

Le bouton « Envoyer le devis au client » envoie un e-mail mis en page (message personnalisé, montant, bouton « Consulter mon devis »). Sur la page du devis, le client peut cliquer « Demander la signature électronique » : le lien de signature lui est alors envoyé automatiquement depuis l'adresse de l'entreprise, avec une copie dans cette boîte. Après la signature, le client reçoit une confirmation et l'entreprise un avis, depuis la même adresse.

Fichiers nécessaires sur GitHub : `package.json` à la racine, et `api/send-mail.js`, `api/request-signature.js` et `api/notify-signature.js` (GitHub › Add file › Create new file, taper `api/send-mail.js` comme nom, coller le contenu).

Dans Vercel › Settings › Environment Variables, puis Redeploy :

| Key | Valeur |
| --- | --- |
| `SUPABASE_URL` | la même adresse que dans `config.js` |
| `SUPABASE_ANON_KEY` | la même clé publique que dans `config.js` |
| `SMTP_HOST` | serveur d'envoi de votre messagerie (Google Workspace `smtp.gmail.com`, OVH `ssl0.ovh.net`, IONOS `smtp.ionos.fr`, Microsoft 365 `smtp.office365.com`) |
| `SMTP_PORT` | `465` (Microsoft 365 : `587`) |
| `SMTP_USER` | `contact@compagnons-ecologiques.fr` |
| `SMTP_PASS` | le mot de passe de cette boîte (Google : mot de passe d'application) |

Sans ces réglages, le bouton copie l'e-mail mis en page et ouvre votre messagerie.

Les documents `documents-cef.json` (fiche produit, RGE, décennale) sont ajoutés automatiquement aux documents joints à la première connexion de l'administrateur.

## Lien depuis le site Webflow

Le plus simple est un bouton ou un lien « Espace commerciaux » qui pointe vers l'adresse Vercel. Dans Webflow : sélectionner le bouton › Link Settings › URL, coller l'adresse, cocher « Open in new tab ».

Pour une adresse à votre nom (par exemple `simulateur.votre-site.fr`) : Vercel › Project › Settings › Domains › Add, puis créez chez votre hébergeur de domaine l'enregistrement CNAME que Vercel indique. Pensez ensuite à mettre cette adresse dans Supabase › URL Configuration.

Évitez d'intégrer l'appli dans une page Webflow (iframe) : certains navigateurs bloquent alors la connexion.

## Reprendre les fiches de la version fichier

Dans l'ancienne version (fichier HTML), cliquez sur « Sauvegarde » : un fichier `.json` est téléchargé. Dans la version en ligne, connecté, cliquez sur « Restaurer » et choisissez ce fichier. Les fiches sont rattachées au compte connecté ; l'administrateur peut ensuite les réattribuer.

## Fichiers

- `index.html` : l'application (fonctionne aussi seule, ouverte depuis l'ordinateur, avec les fiches enregistrées dans le navigateur).
- `config.js` : adresse du projet Supabase et clé publique `anon`.
- `supabase-2.119.0.js` : bibliothèque Supabase pour le navigateur.
- `api/config.js` : (version complète) donne au navigateur l'adresse Supabase et la clé publique.
- `api/send-mail.js` : envoi de l'e-mail au client (commercial connecté uniquement).
- `api/admin-users.js` : création de comptes et changement de mot de passe (administrateur uniquement).
- `supabase/schema.sql` : tables, rôles et règles de sécurité.
