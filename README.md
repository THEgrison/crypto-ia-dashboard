<div align="center">
  <img src="assets/logo.png" alt="Crypto IA" width="72">
  <h1>Crypto IA — Dashboard d'analyse</h1>
  <p>Outil d'aide à la décision en trading crypto, en HTML/CSS/JS pur.</p>
</div>

---

> **Avertissement**
> Cet outil affiche des données de marché et des signaux calculés localement, à titre **informatif uniquement**.
> Il n'exécute **aucun ordre** d'achat ou de vente et n'est connecté à aucun exchange.
> Il ne constitue pas un conseil financier, ne garantit aucun résultat, et les performances passées ne préjugent pas des performances futures.

## Aperçu

![Capture du dashboard : panneau de recommandation et graphique de prix en chandelles](assets/screenshot.png)

Un tableau de bord noir et blanc façon terminal de trading, dense et anguleux, qui regroupe :

- **Recommandation** — signal Acheter / Vendre / Attendre, niveau de confiance, suggestion de timing, prix, variation 24h et capitalisation
- **Graphique de prix** — 30 jours, avec quatre modes d'affichage au choix (chandelles, barres OHLC, ligne, aire) et moyennes mobiles MA7 / MA25 activables
- **Volumes** — volume 24h, moyenne, écart vs moyenne et historique sur 14 jours
- **News & annonces** — chaque actualité porte un « niveau de sérénité » (calme, neutre, tendu, alarmant) rendu en nuances de gris et motifs
- **Hold long terme** — cryptos à faible volatilité, avec capitalisation et tendance
- **Court terme / volatilité** — cryptos à forte volatilité récente, avec momentum

La recherche accepte n'importe quelle crypto référencée par CoinGecko, pas seulement celles de la watchlist.

## Prérequis

- Python 3 (ou n'importe quel serveur de fichiers statiques)
- Une clé API CoinGecko Demo (gratuite)

Aucune dépendance à installer : pas de build, pas de `npm install`.

## Obtenir une clé API CoinGecko

La clé du plan **Demo** est gratuite et suffit largement pour ce dashboard (30 appels/minute, 10 000 appels/mois).

1. Créez un compte sur [coingecko.com](https://www.coingecko.com/account/sign_up)
2. Une fois connecté, ouvrez [Developer Dashboard](https://www.coingecko.com/en/developers/dashboard)
3. Cliquez sur **Add New Key** (ou **Create a Demo API Key**)
4. Copiez la clé générée — elle commence par `CG-`

Cette clé ne donne accès qu'à des données publiques de marché : elle ne permet aucune opération sur votre compte.

## Installation

```bash
git clone https://github.com/THEgrison/crypto-ia-dashboard.git
cd crypto-ia-dashboard
```

Ouvrez `js/config.js` et remplacez le placeholder par votre clé :

```javascript
window.COINGECKO_CONFIG = {
  apiKey: 'CG-VOTRE-CLE-ICI',
  baseUrl: 'https://api.coingecko.com/api/v3',
  refreshIntervalMs: 60_000,
};
```

Sans clé, le dashboard démarre quand même et bascule sur les données de démonstration incluses.

> **Important — évitez de publier votre clé**
> `js/config.js` est versionné dans ce dépôt (il contient un placeholder). Si vous y collez votre clé et poussez vos modifications, **elle deviendra publique**.
>
> Après avoir ajouté votre clé, demandez à git d'ignorer vos modifications de ce fichier :
>
> ```bash
> git update-index --skip-worktree js/config.js
> ```
>
> Pour annuler plus tard : `git update-index --no-skip-worktree js/config.js`

## Lancer le projet

```bash
python3 -m http.server 8080
```

Puis ouvrez http://localhost:8080.

Un serveur local est **indispensable** : ouvrir `index.html` directement en `file://` fait échouer les appels à l'API (politique CORS du navigateur).

Autres options équivalentes :

```bash
npx serve .          # Node
php -S localhost:8080 # PHP
```

L'indicateur en haut à droite affiche l'état de la connexion : `Prix live · CoinGecko` quand les données sont réelles, un message d'erreur avec repli sur les données locales sinon.

## Structure

```
crypto-ia-dashboard/
├── index.html            # Structure du dashboard
├── assets/logo.png       # Logo et favicon
├── css/styles.css        # Thème sombre anguleux
└── js/
    ├── config.js         # Clé API et paramètres de rafraîchissement
    ├── data.js           # Données de démonstration et utilitaires
    ├── api.js            # Client CoinGecko
    ├── charts.js         # Rendu Canvas des graphiques
    └── app.js            # Logique d'interface
```

## Sources de données

| Donnée | Source | Endpoint |
|---|---|---|
| Prix, variation 24h, capitalisation | CoinGecko | `/coins/markets` |
| Volume 24h | CoinGecko | `/coins/markets` |
| Historique prix et volumes | CoinGecko | `/coins/{id}/market_chart?days=30` |
| Recherche de cryptos | CoinGecko | `/coins/list` |
| Signal Acheter / Vendre / Attendre | Calcul local | heuristique MA7 + variation 24h |
| News et niveaux de sérénité | Données de démonstration | — |

Les données sont rafraîchies automatiquement toutes les 60 secondes. La barre d'outils affiche l'heure et l'ancienneté de la dernière mise à jour, et permet de choisir la fréquence (30 s, 1 min, 5 min ou manuel) ainsi que de forcer une actualisation. Le choix est mémorisé dans le navigateur ; `refreshIntervalMs` de `js/config.js` sert de valeur par défaut à la première visite.

### Brancher de vraies news

CoinGecko ne fournit pas de flux d'actualités. Pour remplacer les news de démonstration, branchez une seconde source dans `js/api.js` — par exemple [CryptoPanic](https://cryptopanic.com/developers/api/) (offre gratuite limitée) ou un agrégateur RSS de sites crypto. Le niveau de sérénité peut alors être dérivé des votes ou du sentiment retourné par l'API.

## Sécurité

Ce projet est entièrement côté navigateur, sans backend. **Toute clé placée dans `js/config.js` est visible par quiconque ouvre les outils de développement** sur une instance déployée publiquement.

- Une clé **Demo** reste peu sensible : quota limité, aucun accès au compte.
- Pour un déploiement public, faites transiter les appels par une fonction serverless qui masque la clé.
- N'exposez **jamais** une clé **Pro** côté client.
- `js/config.js` étant versionné, appliquez `git update-index --skip-worktree js/config.js` après y avoir mis votre clé, sinon un `git push` la publierait.

## Accessibilité

- Navigation au clavier complète, avec focus visible sur tous les éléments interactifs
- Recherche avec `role="combobox"`, parcours des résultats aux flèches, validation par `Entrée`, fermeture par `Échap`
- Régions et titres balisés, graphiques dotés de descriptions textuelles mises à jour selon le mode d'affichage
- Contraste élevé, aucune information portée par la seule couleur

## Licence

MIT
