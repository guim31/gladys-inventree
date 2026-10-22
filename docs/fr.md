# InvenTree

Suivez votre inventaire [InvenTree](https://inventree.org/) dans Gladys : les
articles sous leur stock minimum, les articles en rupture, les commandes en
cours et la valeur du stock. Les scènes peuvent réagir quand un article passe
sous son seuil ou qu'une commande est reçue, lire le stock d'un article et, si
vous l'autorisez, sortir des articles du stock. Gladys parle directement à
votre serveur InvenTree, à la maison ou hébergé.

Testée sur un vrai serveur InvenTree 1.6.1 (l'image Docker officielle, avec
PostgreSQL). Vos retours sont les bienvenus sur le forum de Gladys.

## Prérequis

- Gladys Assistant 5.1 ou plus récent.
- Un serveur InvenTree (version 1.0 ou plus récente) joignable depuis la
  machine de Gladys : sur votre réseau, ou sur Internet en HTTPS.
- Un jeton d'API : dans InvenTree, ouvrez vos paramètres utilisateur,
  **Sécurité**, **Jetons d'accès**, ajoutez un jeton et copiez-le. Un
  utilisateur dédié est une bonne idée. Ses rôles (Admin, Groupes) décident de
  ce que Gladys voit :
  - **Pièces : lecture**, obligatoire ;
  - **Commandes d'achat : lecture**, pour les commandes en cours et reçues ;
  - **Articles en stock : lecture**, pour la valeur du stock ;
  - **Articles en stock : modification**, seulement pour sortir du stock
    depuis une scène.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Dans **Adresse d'InvenTree**, saisissez l'adresse que vous ouvrez dans
   votre navigateur, par exemple `http://192.168.1.50:8000` ou
   `https://inventree.example.org`.
3. Collez le **jeton d'API** (avec ou sans le mot `Token` devant).
4. **Lire InvenTree toutes les** : 5, 15 (par défaut), 30 minutes ou 1 heure.
5. **Un appareil par article** : aucun, les articles suivis par l'utilisateur
   du jeton (l'étoile sur la page d'un article, par défaut), ou tous les
   articles avec un stock minimum. 50 articles au plus.
6. **Autoriser les scènes à sortir du stock** : désactivé par défaut.
   Activez-le seulement si une scène doit retirer des articles d'InvenTree.
7. **Langue des noms et des messages** fixe les noms des fonctionnalités (figés
   à l'ajout de l'appareil) et les textes des actions de scène. Français par
   défaut.
8. Enregistrez, puis utilisez **Tester la connexion** : elle affiche la
   version d'InvenTree, le nombre d'articles, ceux sous le seuil et les
   commandes en cours.
9. Dans l'onglet **Découverte**, ajoutez l'appareil **InvenTree** et les
   appareils d'articles que vous voulez.

## Appareils

L'appareil **InvenTree** :

| Fonctionnalité         | Signification                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Articles               | Articles actifs (hors articles virtuels)                                                 |
| Articles sous le seuil | Articles avec un stock minimum et un stock total strictement inférieur (règle InvenTree) |
| Articles en rupture    | Articles avec un stock minimum et plus rien en stock                                     |
| Commandes en cours     | Commandes en attente, passées ou suspendues                                              |
| Commandes en retard    | Commandes dont la date prévue est dépassée                                               |
| Valeur du stock        | Quantité × prix d'achat des articles en stock, dans la devise principale d'InvenTree     |

Les prix dans une autre devise sont convertis avec les taux de change
d'InvenTree ; un article sans prix compte pour rien. La valeur porte l'unité
euro, dollar ou livre quand c'est la devise principale d'InvenTree.

Chaque **appareil d'article** (au nom de l'article) a : la quantité en stock
(avec historique), le stock minimum et la quantité en commande. Le stock d'un
article comprend ses variantes, comme dans InvenTree.

Un jeton dont l'utilisateur ne peut pas voir les commandes ou le stock laisse
ces fonctionnalités vides, plutôt que d'afficher un faux zéro.

## Widget de tableau de bord

**Articles à réapprovisionner** : des tuiles avec les articles sous le seuil,
en rupture et les commandes en cours (en orange quand l'une est en retard), et
la liste des articles à réapprovisionner, les plus vides d'abord : quantité,
minimum, quantité en commande.

## Déclencheurs de scène

- **Article sous le seuil** : un article passe sous son stock minimum.
  Variables : article, référence interne (IPN), catégorie, quantité en stock,
  stock minimum, quantité en commande. L'article est annoncé de nouveau après
  être revenu à son minimum.
- **Article en rupture** : un article avec un stock minimum n'en a plus du
  tout. Variables : article, IPN, catégorie, stock minimum, quantité en
  commande.
- **Commande reçue** : une commande en cours est terminée dans InvenTree.
  Variables : référence de la commande, fournisseur, description, nombre de
  lignes.

La première lecture après l'installation est silencieuse : ce qui est déjà bas
n'est pas annoncé. Un redémarrage n'annonce rien deux fois. Au plus 10
événements de chaque sorte partent par lecture (un import massif n'inonde pas
vos scènes).

## Actions de scène

- **Lire le stock d'un article** : indiquez l'article par son nom, sa
  référence interne (IPN), un morceau de nom qu'un seul article porte, ou son
  numéro (`#12`). Sorties : quantité en stock, stock minimum, quantité en
  commande, sous le seuil (oui/non) et une phrase comme « Arduino Nano : 2 en
  stock, minimum 3, 5 en commande. ».
- **Sortir du stock** (seulement si autorisé dans la configuration) : retire
  une quantité d'un article, en commençant par ses lots les plus anciens, et
  l'inscrit dans l'historique d'InvenTree (« Removed by a Gladys Assistant
  scene »). Rien n'est retiré si le stock est insuffisant. Les articles
  sérialisés ne sont pas touchés. Mêmes sorties que la lecture.

## Exemples de scènes

- **Liste de courses** : déclencheur « Article sous le seuil » → message
  « Racheter {{triggerEvent.data.part}} : il en reste
  {{triggerEvent.data.quantity}} (minimum {{triggerEvent.data.minimum}}) ».
- **Colis arrivé** : déclencheur « Commande reçue » → message « Commande
  {{triggerEvent.data.order}} de {{triggerEvent.data.supplier}} reçue ».
- **Filament pour la prochaine impression** : tous les soirs → « Lire le stock
  d'un article » `PLA noir` → continuer seulement si « sous le seuil » est vrai
  → envoyer la phrase en message.
- **Capsules de café** : un appui sur un bouton → « Sortir du stock »
  `Capsules café`, 1.

## Dépannage

- **« Jeton refusé »** : le jeton a été révoqué ou a expiré ; créez-en un
  nouveau.
- **« L'utilisateur de ce jeton ne peut pas voir les articles »** : donnez à
  l'utilisateur le rôle **Pièces** (lecture), ou utilisez le jeton d'un autre
  utilisateur.
- **« Cette adresse ne répond pas comme InvenTree »** : vérifiez l'adresse
  (celle de l'interface web, avec son port), et qu'aucun proxy ne demande de
  connexion avant.
- **Ni commandes ni valeur** : l'utilisateur du jeton n'a pas le rôle
  **Commandes d'achat** ou **Articles en stock** (lecture) ; les journaux de
  l'intégration le disent une fois.
- **Aucun appareil d'article** : suivez les articles (étoile) avec
  l'utilisateur du jeton, ou choisissez « Tous les articles avec un stock
  minimum ».
- Journaux détaillés : mettez la variable `LOG_LEVEL` du conteneur à `debug`.

## Limites

- Un seul serveur InvenTree par intégration.
- InvenTree ne prévient pas : les changements arrivent dans Gladys à la
  lecture suivante (15 minutes par défaut), ou tout de suite après une sortie
  de stock faite par une scène.
- Un article sans stock minimum n'est jamais « sous le seuil » ni « en
  rupture » : donnez un minimum (même 1) aux articles à suivre.
- La valeur ne compte que les articles en stock qui ont un prix d'achat.
- Les commandes clients, les fabrications et les autres modules d'InvenTree ne
  sont pas suivis.
- Sans lien avec le projet InvenTree.
