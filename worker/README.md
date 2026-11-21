# ASTT Auth Worker (Cloudflare Workers)

Ce Worker gère l'authentification **Discord OAuth2 ➔ Firebase Custom Token** et les tâches automatiques de clôture/rappel.

## Déploiement en 3 étapes simples :

### 1. Variables secrètes (chiffrées)
Depuis le dossier `worker/`, exécutez :
```bash
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
```
*(Collez le JSON complet du compte de service Firebase téléchargé depuis la Console Firebase > Paramètres du projet > Comptes de service)*

### 2. Variables publiques dans `wrangler.toml`
Renseignez `DISCORD_GUILD_ID` (clic droit sur votre serveur Discord > Copier l'ID).

### 3. Déploiement
```bash
npx wrangler deploy
```
Copiez l'URL générée (ex: `https://astt-auth.xyz.workers.dev`) et renseignez-la dans le fichier `.env` du frontend (`VITE_WORKER_URL`).
