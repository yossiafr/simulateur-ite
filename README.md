# Simulateur d'autofinancement ITE

Mini-CRM pour les experts techniques en isolation thermique par l'extérieur. On saisit le client, son logement et sa facture de chauffage. L'appli calcule la mensualité du crédit, les économies, les aides (CEE, aide région), la plus-value estimée et le pourcentage du projet couvert. Elle produit une synthèse imprimable et un e-mail mis en page pour le client.

Technique : page web unique (`index.html`), base et connexions Supabase, hébergement Vercel. Trois fonctions serveur facultatives dans `api/`.

## Règles de calcul

1. **Mensualité** : même méthode que la simulation Sofinco. Le crédit porte sur le montant à financer (travaux moins aide région), au taux débiteur saisi (6,686 % par défaut), avec des mensualités constantes arrondies au centime. La 1ʳᵉ échéance tombe « différé » mois après la fin des travaux (6 par défaut) : les intérêts courus au-delà du premier mois (30 jours par mois, taux ÷ 365) s'ajoutent au capital. Vérifié sur 16 650 € à 6,686 % sur 120 mois : 195,87 €/mois, TAEG 6,88 %, 6 854,40 € d'intérêts. L'assurance facultative (en % par mois du montant financé, 0,15 % chez Sofinco) s'ajoute à la mensualité. Le TAEG (hors assurance) est affiché. La mensualité peut aussi être saisie à la main.
2. **Économie mensuelle** : facture de chauffage annuelle × taux d'économie (25 % par défaut) ÷ 12, ou saisie à la main.
3. **Économie globale** : économie mensuelle × (différé + durée), avec une hausse annuelle de l'énergie facultative.
4. **Plus-value** : valeur du bien × 10 % (Notaires de France, transactions 2024), réalisable à la revente.
5. **Projet couvert** : (économies + aides CEE et région + plus-value) ÷ montant total du projet (travaux, sans déduire l'aide région), affiché jusqu'à 100 %. La synthèse et l'e-mail de synthèse affichent le montant total du projet et l'échéance du financement (calculée, elle, sur travaux − aide région).
   Si la couverture dépasse 100 %, l'économie due à l'ITE est baissée automatiquement (jusqu'à 23 % minimum), puis la plus-value (jusqu'à 5 % minimum), juste assez pour revenir à 100 %. Les champs « Économie due à l'ITE » et « Plus-value estimée » de la fiche affichent les taux retenus (le taux saisi est gardé en référence et revient si la couverture redescend sous 100 %) ; la synthèse et l'e-mail utilisent les mêmes taux.

Les valeurs par défaut se règlent dans l'onglet Administration.

## Onglets visibles

Administration › Onglets visibles : décochez un onglet (Synthèse, Photos, Carte, Devis, Dossier, Agenda) pour le masquer à tous les experts techniques ou à tous les télépros. La Fiche client reste toujours visible et l'administrateur voit toujours tout. Le changement s'applique au prochain chargement de la page. C'est un masquage d'affichage : les droits sur les données restent ceux du rôle.

## Foyer et revenus

Sur la fiche client : revenu fiscal de référence, nombre de personnes du foyer, revenus nets mensuels et statut de Monsieur et de Madame (salarié CDI, CDD, à son compte, retraité…), crédits en cours (type, mensualité, date de fin). La couleur du foyer MaPrimeRénov' (bleu, jaune, violet, rose) est calculée automatiquement avec le barème 2026 : Île-de-France si le code postal commence par 75, 77, 78, 91, 92, 93, 94 ou 95, sinon barème hors Île-de-France. Le taux d'endettement (crédits ÷ revenus, puis avec la mensualité du projet) s'affiche sous les crédits. La couleur apparaît aussi dans la liste des clients et sur les RDV de l'agenda.

Prime CEE calculée automatiquement : surface de murs à isoler × 14 €/m² pour les foyers bleu et jaune, × 12 €/m² pour les foyers violet et rose (tarifs modifiables dans Administration › Tarifs de base). Saisir un montant dans le champ Prime CEE force une autre valeur ; le vider revient au calcul automatique.

Montant des travaux calculé automatiquement : m² de murs à isoler × (prix isolant + prix main d'œuvre TTC / m², Administration › Tarifs de base). Un montant tapé à la main est gardé ; vider le champ revient au barème. Quand le client a un devis, le montant est celui du devis, et changer les m² dans la fiche met à jour les quantités du devis (sauf devis signé).

Précarité du devis automatique selon la couleur du foyer (revenu fiscal de référence) : bleu = très modeste, jaune = modeste, violet = intermédiaire, rose = classique. Elle reste modifiable dans le devis.

Aide région calculée automatiquement : surface de murs × 40 €/m² (réglable dans Administration › Tarifs de base › Aide région). Elle est déduite du montant à financer et du reste à régler du devis. Saisir un montant force une autre valeur ; le vider revient au calcul auto.

Envoi du devis : la synthèse du projet (autofinancement) est jointe par défaut. Elle apparaît comme une page juste après le devis, avant les autres documents joints : sur la page du lien envoyé au client et dans le PDF du devis (une page A4 paysage). L'e-mail du devis envoyé depuis le CRM contient aussi le PDF en pièce jointe (devis, synthèse, puis documents joints cochés) : le CRM prépare les pages du devis et de la synthèse, le serveur (`api/send-mail.js`, librairie `pdf-lib`) ajoute les documents et joint le fichier. Le client peut tout télécharger en un seul PDF (devis, synthèse, documents joints) : bouton « ⬇ Télécharger le devis (PDF) » dans l'e-mail (lien `?voir=…&pdf=1`, qui ouvre directement la fenêtre d'enregistrement en PDF) et en haut de la page du devis. Ses chiffres sont copiés dans le devis à chaque enregistrement de la fiche, car le lien public ne lit que le devis et les coordonnées du client. Décochez « Synthèse de votre projet » dans les documents joints du devis pour ne pas l'envoyer. Mode de paiement par défaut : Chèque, Virement, Financement.

**Infos du logement depuis l'adresse** : dans la fiche, section Logement & énergie, le bouton « 🔎 Infos du logement depuis l'adresse » cherche le DPE du client via la fonction `api/dpe.js` (bases publiques gratuites, sans clé à configurer) :
1. l'adresse est d'abord retrouvée dans la Base Adresse Nationale (position exacte et identifiant de l'adresse) ;
2. DPE depuis juillet 2021 (ADEME) : par identifiant d'adresse, puis autour de la maison (40 m), puis par texte ;
3. anciens DPE d'avant juillet 2021 (ADEME), signalés « Ancien DPE » car la méthode était différente ;
4. en dernier recours, l'étiquette **estimée** du bâtiment calculée par le CSTB (BDNB), signalée « Estimation, à confirmer » ; « Utiliser » ne reporte alors que l'étiquette.
« Utiliser » remplit la fiche (étiquette, année, surface, énergie). Si `api/dpe.js` n'est pas encore en ligne, le bouton garde l'ancienne recherche ADEME directe. (Kelvin, demandé au départ, est payant et sans accès public.)

**Simulateur de primes** (outil interne) : bouton « 🧮 Simulateur de primes » en haut de la fiche client (caché aux télépros). Questionnaire en 5 étapes (logement et ancienneté, code postal, surface habitable et niveaux ou surface de murs connue, personnes du foyer, revenu fiscal exact ou tranche) puis estimation prime CEE + aide région avec les tarifs de l'Administration. « Enregistrer dans la fiche » reporte les réponses (type, CP, surfaces, foyer, revenu fiscal ; sans revenu exact, la prime CEE calculée).

## Suivi commercial

- **Tableau de bord** (onglet réservé à l'admin) : RDV, RDV honorés, ventes, taux de transformation, CA signé, panier moyen ; un tableau par télépro (RDV pris, confirmés, honorés, vendus, note moyenne), un par expert technique, et la comparaison note du télépro / vente. Période : semaine, mois, mois dernier, 3 mois, tout.
- **Alerte doublon** : à la création d'un client (fiche ou prise de RDV), l'appli signale un client existant avec le même téléphone ou la même adresse, même s'il est suivi par quelqu'un d'autre (seuls le nom, la ville, le statut et le responsable sont montrés).
- **Relances** : champ « Date de rappel » sur la fiche et filtre « 🔔 À relancer » dans la liste. Y apparaissent les rappels du jour ou en retard et les devis envoyés depuis 7 jours ou plus sans signature. Un RDV statué « À rappeler » programme un rappel à J+2.
- **Dossier** : onglet pour photographier ou joindre les pièces (avis d'imposition, taxe foncière, pièce d'identité, facture d'énergie, RIB, autre). Les photos sont réduites automatiquement. Non visible des télépros.
- **Tournée** : dans l'Agenda, vue « Tournée » : carte des RDV de la semaine (ou d'un jour), une couleur par expert technique, reliés dans l'ordre de la journée depuis son domicile.
- **Rappel la veille** : chaque jour vers 17 h, un e-mail de rappel part depuis contact@ vers les clients qui ont un RDV confirmé le lendemain (date, heure, adresse, nom de l'expert technique). Fichiers `api/rappels.js` et `vercel.json`. Variables Vercel en plus : `SUPABASE_SERVICE_ROLE_KEY` (Supabase › Project Settings › API, clé secrète service_role) et `CRON_SECRET` (un mot de passe long de votre choix). Le client doit avoir un e-mail sur sa fiche.

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

Onglet « Photos & métrage » de chaque fiche : prendre la maison en photo depuis le téléphone (ou choisir une photo). Sur la photo : 1) placer une mesure connue (hauteur de porte ≈ 2,15 m, ou une longueur mesurée), puis « Valider la mesure » : elle est verrouillée (le bouton « Modifier la mesure » la déverrouille), 2) entourer chaque façade, 3) chaque fenêtre ou porte. L'appli donne la surface avec et sans ouvrants (« 🗑 Supprimer cette photo » en haut, avec confirmation), et la reporte dans la fiche et le devis. Le bouton « Appliquer le crépi » colore les façades dans la teinte choisie (gratuit). Détection automatique des façades et ouvrants (« ✨ Détecter façade et ouvrants ») et rendu réaliste du crépi par IA (facultatifs) : ajouter la variable Vercel `GEMINI_API_KEY` (clé créée sur aistudio.google.com › Get API key, facturation activée sur le projet Google), puis Redeploy. Modèles utilisés : `gemini-3.1-flash-image` pour le rendu (environ 0,07 $ par image), `gemini-3.5-flash-lite` pour la détection (moins d'un centime par photo) ; si Google ne propose plus un modèle, le suivant de la liste est essayé. Variables facultatives pour forcer un autre modèle : `GEMINI_MODEL`, `GEMINI_VISION_MODEL`. Les deux boutons IA restent visibles dès qu'une photo est ajoutée : tant que l'IA n'est pas prête, ils sont grisés et un message indique ce qui manque (variable Vercel ou fonction `/api/rendu-ia`). Projet déjà en ligne : relancer `mise-a-jour-devis.sql` (section 9, table des photos).

### Street View (onglet Carte)
Sans réglage, l'onglet Carte utilise la vue Street View publique de Google. Si elle reste vide, créez une clé gratuite « Maps Embed API » dans Google Cloud (restreinte à l'adresse du site) et ajoutez-la dans `config.js` : `mapsKey: "..."`.

## Droits

| | Télépro | Expert technique | Admin |
|---|---|---|---|
| Créer un client et voir ses propres clients | oui (identité et logement) | oui | oui |
| Financement, aides, synthèse, photos, devis, e-mails | non | oui | oui |
| Carte et agenda | oui | oui | oui |
| Placer un RDV | oui, sans choisir l'expert technique | oui, pour lui | oui, pour qui il veut |
| Voir les RDV des autres | créneaux des autres télépros en gris, code postal et ville seulement | non | oui |
| Confirmer un RDV de télépro et choisir l'expert technique | non | non | oui |
| Voir et modifier les clients des autres | non | non | oui |
| Réattribuer ou supprimer une fiche | non | non | oui |
| Gérer les comptes et les réglages | non | non | oui |

Un RDV pris par un télépro reste « À confirmer » (pointillés dans l'agenda de l'admin, bandeau « RDV à confirmer »). L'admin l'ouvre, choisit l'expert technique et clique « Confirmer le RDV » : le RDV passe dans l'agenda de l'expert technique et la fiche client lui est attribuée. Le télépro voit alors son RDV « Confirmé », sans pouvoir le modifier.

Domicile des experts techniques : dans Administration, colonne « Domicile », saisir l'adresse de chaque expert technique (visible seulement par lui et l'admin). Sur chaque RDV, l'appli affiche le trajet par la route : depuis le domicile pour le premier RDV de la journée, avec l'heure de départ conseillée (trajet + 10 min), sinon depuis le RDV précédent. Lors de la confirmation d'un RDV de télépro, le trajet s'affiche dès qu'on choisit l'expert technique.

Fiche RDV en PDF (admin) : dans un RDV, bouton « 📄 Fiche RDV (PDF) ». Une page A4 avec en tête l'expert technique, la date et l'heure, puis le client, ses coordonnées, le logement, le foyer fiscal et sa couleur, les revenus et crédits, le commentaire du RDV et les notes. La note en étoiles n'y figure pas, pour pouvoir la remettre à l'expert technique. Dans la fenêtre d'impression, choisir « Enregistrer au format PDF ».

En prenant un RDV, le bouton « Proposer les meilleurs créneaux » cherche sur les deux semaines suivantes les créneaux libres les plus proches des RDV déjà placés. Distance et temps de trajet réels par la route, calculés par le service d'itinéraire gratuit de l'IGN (Géoplateforme, sans clé ni abonnement) ; temps de trajet + 10 min de marge réservés entre deux RDV. Si le service ne répond pas, l'appli revient à une estimation (vol d'oiseau × 1,3, 55 km/h). Les adresses sont localisées avec la Base Adresse Nationale (gratuite). Le télépro note le RDV de 1 étoile (pas terrible) à 4 étoiles (très bon). La note n'est visible que par l'admin et le télépro qui a pris le RDV, jamais par l'expert technique (table séparée protégée par la base).

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

### Ajouter un expert technique ou un télépro

Dans Supabase › Authentication › Users › Add user › Create new user : son e-mail et un mot de passe provisoire, cocher « Auto Confirm User ». Dans l'appli, onglet Administration : il apparaît désactivé. Saisir son nom, choisir son rôle (Expert technique, Télépro ou Admin), cocher « Actif », puis lui communiquer son e-mail et son mot de passe. Il peut le changer avec « Mot de passe oublié ».

### Version complète (facultatif)

Le dossier `api/` ajoute trois fonctions Vercel : création des comptes et changement de mot de passe depuis l'appli, et envoi direct des e-mails. Pour l'utiliser, laissez `config.js` vide (ou supprimez-le) et ajoutez dans Vercel › Settings › Environment Variables : `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` (secrète), puis redéployez.

## Envoi des devis par e-mail depuis contact@ (recommandé)

Le bouton « Envoyer le devis au client » envoie un e-mail mis en page (message personnalisé, montant, bouton « Consulter mon devis »). Sur la page du devis, le client peut cliquer « Demander la signature électronique » : le lien de signature lui est alors envoyé automatiquement depuis l'adresse de l'entreprise, avec une copie dans cette boîte. Après la signature, le client reçoit une confirmation et l'entreprise un avis, depuis la même adresse.

Fichiers nécessaires sur GitHub : `package.json` à la racine, et `api/send-mail.js`, `api/request-signature.js` et `api/notify-signature.js` (GitHub › Add file › Create new file, taper `api/send-mail.js` comme nom, coller le contenu).

Dans Vercel › Settings › Environment Variables, puis Redeploy :

| Key | Valeur |
| --- | --- |
| `SUPABASE_URL` | facultatif : sinon lue dans `config.js` |
| `SUPABASE_ANON_KEY` | facultatif : sinon lue dans `config.js` |
| `SMTP_HOST` | serveur d'envoi de votre messagerie (Google Workspace `smtp.gmail.com`, OVH `ssl0.ovh.net`, IONOS `smtp.ionos.fr`, Microsoft 365 `smtp.office365.com`) |
| `SMTP_PORT` | `465` (Microsoft 365 : `587`) |
| `SMTP_USER` | `contact@compagnons-ecologiques.fr` |
| `SMTP_PASS` | le mot de passe de cette boîte (Google : mot de passe d'application) |

Une fois réglé, « Envoyer au client » (synthèse) et « Envoyer depuis contact@ » (devis) partent directement du CRM. La synthèse garde une copie dans la boîte contact@ ; le devis part sans copie (les réponses du client arrivent quand même dans contact@). Le bouton « Ouvrir plutôt ma messagerie » reste en secours. Sans ces réglages, le CRM indique quelle variable manque dans Vercel et propose d'ouvrir votre messagerie. Les espaces du mot de passe d'application Google sont ignorés.

Les documents `documents-cef.json` (fiche produit, RGE, décennale) sont ajoutés automatiquement aux documents joints à la première connexion de l'administrateur.

## Lien depuis le site Webflow

Le plus simple est un bouton ou un lien « Espace experts techniques » qui pointe vers l'adresse Vercel. Dans Webflow : sélectionner le bouton › Link Settings › URL, coller l'adresse, cocher « Open in new tab ».

Pour une adresse à votre nom (par exemple `simulateur.votre-site.fr`) : Vercel › Project › Settings › Domains › Add, puis créez chez votre hébergeur de domaine l'enregistrement CNAME que Vercel indique. Pensez ensuite à mettre cette adresse dans Supabase › URL Configuration.

Évitez d'intégrer l'appli dans une page Webflow (iframe) : certains navigateurs bloquent alors la connexion.

## Reprendre les fiches de la version fichier

Dans l'ancienne version (fichier HTML), cliquez sur « Sauvegarde » : un fichier `.json` est téléchargé. Dans la version en ligne, connecté, cliquez sur « Restaurer » et choisissez ce fichier. Les fiches sont rattachées au compte connecté ; l'administrateur peut ensuite les réattribuer.

## Fichiers

- `index.html` : l'application (fonctionne aussi seule, ouverte depuis l'ordinateur, avec les fiches enregistrées dans le navigateur).
- `config.js` : adresse du projet Supabase et clé publique `anon`.
- `supabase-2.119.0.js` : bibliothèque Supabase pour le navigateur.
- `api/config.js` : (version complète) donne au navigateur l'adresse Supabase et la clé publique.
- `api/send-mail.js` : envoi de l'e-mail au client (expert technique connecté uniquement).
- `api/admin-users.js` : création de comptes et changement de mot de passe (administrateur uniquement).
- `supabase/schema.sql` : tables, rôles et règles de sécurité.


Note : à l'écran, le rôle « commercial » s'appelle « Expert technique ». Le nom interne du rôle (`commercial` dans Supabase) ne change pas.
