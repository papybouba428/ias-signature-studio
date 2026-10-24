# IAS Signature Studio — version serveur

Application autonome Node.js 20+, sans abonnement ni base de données externe.

## Démarrage local

Créer un fichier `.env` (jamais versionné) :

```
AUTH_MODE=local
PYTHON=python
```

Puis `npm run dev` et ouvrir http://localhost:3000 . `AUTH_MODE=local` simule un administrateur pour développer sans Azure ; il est refusé quand `NODE_ENV=production`. Pillow est requis : `python -m pip install -r requirements.txt`.

Tests automatisés : `npm test` (Python et Pillow requis pour les tests du GIF).

## Authentification (SSO Microsoft)

L'administration utilise l'authentification intégrée d'Azure App Service (fournisseur Microsoft Entra ID), configurée avec « Autoriser l'accès non authentifié » afin que la bannière et `/go` restent publics.

- Le serveur lit l'identité dans l'en-tête `X-MS-CLIENT-PRINCIPAL` et exige le rôle d'application `Signature.Admin` (modifiable par `ADMIN_ROLE`) sur `/api/admin/*` : 401 sans connexion, 403 sans le rôle.
- L'en-tête n'est pris en compte que si App Service indique `WEBSITE_AUTH_ENABLED=True` ; ailleurs, il serait falsifiable.
- Les requêtes POST et DELETE de l'administration doivent provenir de l'outil lui-même (contrôle de l'en-tête `Origin`).
- Chaque action d'administration est journalisée sur la sortie standard (`audit`, utilisateur, campagne, date).

## Pour envoyer un lien aux collaborateurs

Déployer le dossier sur Azure App Service (Linux, Node.js 20+) avec Python 3 et Pillow (pour les GIF). Variables : `NODE_ENV=production`, `DATA_DIR` (stockage persistant, par exemple un partage Azure Files monté sur `/mnt/data`), `PYTHON` si l'interpréteur ne s'appelle pas `python3`. `PORT` est fourni par App Service.

`DATA_DIR` contient `campaigns.json`, `settings.json`, `stats.json`, les visuels (`uploads/`) et `campaigns.gif` : sans stockage persistant, tout est perdu au redéploiement. Au premier démarrage, les visuels de l'ancien emplacement `public/assets/uploads/` y sont copiés.

## Fonctionnement

- Espace collaborateur : informations locales, aperçu, copie HTML Outlook, export HTML.
- Espace administrateur : connexion Microsoft, ajout / modification / suppression, ordre et statut des campagnes. Les images sont conservées côté serveur et un GIF est régénéré en arrière-plan.
- La signature inclut **un seul lien** : `/go` (page de sélection des campagnes). Un GIF ne peut pas rendre ses images individuellement cliquables. La page `/go` redirige ensuite vers le lien propre à chaque campagne.
- Les clics comptés sont les clics de redirection sur `/go/id`, et non les emails ouverts, ni toutes les conversions.

## Limites importantes

- Une mise à jour du GIF existant peut rester en cache dans certains Outlook : tester la mise à jour réelle. Pour garantir une campagne à jour dans tous les emails, mieux vaut un processus de renouvellement de signature ou une solution d'administration Microsoft 365 adaptée.
- Les versions d'Outlook ne rendent pas toutes les animations GIF. La première image doit être pertinente seule.
- Les images de signatures doivent être accessibles publiquement en HTTPS, même si l'interface administrateur reste privée.
- Le mode « admin » nécessite **serveur déployé et variables secrètes**, pas un simple fichier HTML envoyé par email.
- Les exemples de campagne ne sont pas préchargés : seul l'administrateur ajoute les visuels et leurs vrais liens.
- Renforcer la sécurité avant tout déploiement à grande échelle : proxy HTTPS, journalisation, sauvegardes, protection CSRF, limitation des accès IP si possible, gestion de plusieurs admins si nécessaire.


## Correctif du bandeau centralisé (15 octobre 2026)

- Les signatures utilisent maintenant l'URL fixe `/assets/campaigns.gif`, régénérée lors des mises à jour.
- Si une seule campagne est active, `/go` redirige directement vers le lien de la campagne. Avec plusieurs campagnes, il affiche une sélection.
- Le GIF évite désormais le recadrage : les affiches sont ajustées entièrement, avec des bandes de fond IAS si nécessaire.
- Une image distante doit être consultable **sans connexion** via HTTPS depuis le navigateur privé d'un destinataire. Vérifier la réponse HTTP 200 et `Content-Type: image/gif`.
- Stockage persistant impératif pour `DATA_DIR` (données, visuels et `campaigns.gif`). Sur une plateforme à disque éphémère, ces fichiers peuvent disparaître ou diverger entre instances. Utiliser un volume persistant unique ou un stockage d'objets partagé avant production.
- Outlook, Gmail et les proxys peuvent mettre en cache les images : `no-store` côté serveur ne force pas l'actualisation d'un message déjà reçu. Tester l'affichage sur Outlook desktop, Outlook web et Gmail externe.
- Le GIF entier ne possède qu'un seul lien ; pour des liens différents sur chaque campagne, utiliser des bannières statiques cliquables séparées ou une page de sélection.
- Les règles Exchange Online ne sont pas encore installées : les modifications de la partie **identité** de la signature ne se répercutent pas automatiquement sur les anciennes signatures.

## Signature v2 (24 octobre 2026)

- Signature fluide (100 %, 600 px maximum, coordonnées sur 3 lignes courtes) : lisible sur mobile sans réduction, testée à 320 et 375 px. Bannière de campagne en pleine largeur sous les coordonnées (GIF 600×204 ; visuels conseillés au ratio ≈ 3:1).
- Logo et icônes en PNG hébergés dans `public/assets/signature/` (les symboles Unicode s'affichaient en emojis selon les messageries). Ces fichiers, `/assets/campaigns.gif`, `/go` et `/r/*` doivent rester publics (chemins exclus de l'authentification App Service).
- L'emplacement de la bannière est toujours inclus : sans campagne active, le GIF est une image transparente de 600×1 (invisible) et `/go` redirige vers le site web ; la première campagne publiée apparaît dans les signatures existantes.
- Site web et réseaux sociaux passent par `/r/<website|linkedin|facebook|instagram|tiktok>`, qui redirige vers le lien défini dans l'administration (réseau non renseigné → site web). Changer un lien ne demande plus de recopier les signatures.
- Plusieurs numéros séparés par `/`, `,` ou `;` donnent chacun un lien `tel:`.
- Déploiement : `docker buildx build --platform linux/amd64 -t ghcr.io/falloudiakhate/ias-signature-studio:latest --push .` puis redémarrage de l'App Service.
