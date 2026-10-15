# IAS Signature Studio — version serveur

Application autonome Node.js 20+, sans abonnement ni base de données externe.

## Démarrage local

```bash
export IAS_ADMIN_PASSWORD='REMPLACER_PAR_UN_SECRET_DE_12_CARACTERES_MINIMUM'
export IAS_SESSION_SECRET='REMPLACER_PAR_UN_SECRET_ALEATOIRE_DE_32_CARACTERES_MINIMUM'
npm start
```

Ouvrir http://localhost:3000 . Sous Windows PowerShell : `$env:IAS_ADMIN_PASSWORD='...'` et `$env:IAS_SESSION_SECRET='...'` puis `npm start`.

## Pour envoyer un lien aux collaborateurs

Déployer le dossier sur un hébergement Node.js avec HTTPS, Python 3 et Pillow (pour les GIF). Définir les variables `IAS_ADMIN_PASSWORD`, `IAS_SESSION_SECRET`, `NODE_ENV=production`, `PORT` selon l'hébergeur. Assurer un stockage **persistant** pour `data/` et `public/assets/uploads/` : sinon les campagnes et statistiques seront perdues au redéploiement. Ne pas publier les identifiants. Protéger `/api/admin/*` via HTTPS et le mot de passe.

Installer Pillow dans l'environnement de l'hébergeur : `python3 -m pip install pillow`.

## Fonctionnement

- Espace collaborateur : informations locales, aperçu, copie HTML Outlook, export HTML.
- Espace administrateur : connexion par mot de passe, ajout / modification / suppression, ordre et statut des campagnes. Les images sont conservées côté serveur et un GIF est régénéré.
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
- Stockage persistant impératif pour `data/`, `public/assets/uploads/` et `public/assets/campaigns.gif`. Sur une plateforme à disque éphémère, ces fichiers peuvent disparaître ou diverger entre instances. Utiliser un volume persistant unique ou un stockage d'objets partagé avant production.
- Outlook, Gmail et les proxys peuvent mettre en cache les images : `no-store` côté serveur ne force pas l'actualisation d'un message déjà reçu. Tester l'affichage sur Outlook desktop, Outlook web et Gmail externe.
- Le GIF entier ne possède qu'un seul lien ; pour des liens différents sur chaque campagne, utiliser des bannières statiques cliquables séparées ou une page de sélection.
- Les règles Exchange Online ne sont pas encore installées : les modifications de la partie **identité** de la signature ne se répercutent pas automatiquement sur les anciennes signatures.
