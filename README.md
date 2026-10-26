# MyEpitechStats

Une extension pour **my.epitech.eu** : une timeline de tes projets, avec en
plus quelques petits bonus. Marche sur **Chrome** (Edge, Brave…) et **Firefox**.

> Projet perso, non officiel, pas affilié à Epitech. Aucune donnée n'est
> envoyée sur internet : tout reste dans ton navigateur.

<div align="center">
  <img src="utils/img.png"/>
</div>

## Installer (2 minutes, rien à installer d'autre)

### 1. Télécharger

👉 **[Télécharger le ZIP](https://github.com/moustiIIon/myepitech-stats/archive/refs/heads/main.zip)**

Puis dézippe-le (double-clic sur le fichier).

### 2. Charger l'extension

**Chrome / Edge / Brave**

1. Va sur `chrome://extensions`
2. Active **Mode développeur** (en haut à droite)
3. Clique sur **Charger l'extension non empaquetée**
4. Choisis le dossier **`dist`** (dans le dossier dézippé)

**Firefox**

1. Va sur `about:debugging#/runtime/this-firefox`
2. Clique sur **Charger un module complémentaire temporaire…**
3. Choisis le fichier **`dist-firefox/manifest.json`**

⚠️ Sur Firefox, il faut refaire ça à chaque redémarrage du navigateur
(limite de Firefox).

C'est fini, va sur [my.epitech.eu](https://my.epitech.eu) 🎉

## Utiliser

1. Dans le menu de gauche, clique sur **Timeline** (sous *Projects*).
2. Ouvre la page **Units** une fois : ça permet de n'afficher que les projets
   de **tes** units (celles où tu es inscrit).
3. Navigue sur les pages **Projects** (Upcoming / Current / Past) : la
   timeline se remplit toute seule.

## Les bonus

- **Test results** : le pourcentage de réussite à côté du nom de chaque projet.
- **Evaluations** : ouvre un *View report* pour voir le total de tes notes
  (ex. `56/58 · 97%`), il reste ensuite affiché sur la carte.
- **Menu burger** : le bouton rond ☰ sur le bord du menu de gauche le réduit
  à ses icônes.
- Fonctionne en mode clair et en mode sombre.

## Mettre à jour

Re-télécharge le ZIP, remplace l'ancien dossier, puis sur
`chrome://extensions` clique sur 🔄 à côté de MyEpitechStats (Firefox :
refais l'étape de chargement).

## Un souci ?

Le site change parfois son design, ce qui peut casser un bout de
l'extension. Ouvre une issue sur GitHub avec une capture d'écran.

## Pour les devs

Voir [DEVELOPMENT.md](DEVELOPMENT.md). Confidentialité : [PRIVACY.md](PRIVACY.md).
