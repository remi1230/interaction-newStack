# 🎨 Interaction — Générateur de dessins interactifs avec PixiJS

Ce projet est une application web (React + Vite + TypeScript) qui permet de **dessiner par interactions**.
Des avatars se déplacent sur un canvas rendu avec **PixiJS**, et leurs trajectoires sont influencées par des **modifiers** (attracteurs, rotateurs, etc.) posés par l’utilisateur.
Le canvas n’est pas réinitialisé à chaque frame : les points laissent des **trails persistants**, formant peu à peu un dessin unique.

---

## 🚀 Fonctionnalités

* **Avatars dynamiques** : les particules (avatars) se déplacent en fonction des forces appliquées.
* **Modifiers interactifs** :

  * *Attractor* : attire les avatars vers un point.
  * *Rotator* : fait tourner les avatars autour d’un point.
  * (d’autres types sont prévus : polygonator, spiralor, alternator…).
* **Couleurs dynamiques** : la couleur des avatars varie en **OKLCH**, avec une teinte (`hue`) proportionnelle à leur vitesse.
* **Interface utilisateur (React + Zustand)** :

  * Contrôle du nombre d’avatars, vitesse, rayon de point, opacité des trails.
  * Ajout d’attracteurs/rotateurs par simple clic sur le canvas.
  * Ajustement du rayon et de l’intensité des modifiers.
  * Sélecteurs de couleur pour le fond et la teinte.
* **Trail persistante** grâce au double buffer (`ping-pong RenderTexture`).
* **Mouvement sans inertie (option)** : la vitesse est réinitialisée à chaque frame, seul l’effet des modifiers crée le mouvement.

---

## 🛠️ Stack technique

* [React](https://react.dev/) + [Vite](https://vitejs.dev/)
* [TypeScript](https://www.typescriptlang.org/)
* [PixiJS v8](https://pixijs.com/) (rendu 2D performant avec GPU)
* [Zustand](https://github.com/pmndrs/zustand) (gestion d’état simple et efficace)

---

## 📁 Structure du projet

```text
interaction/
├── src/
│   ├── components/      # UI React (RightPanel, CanvasStage…)
│   ├── engine/          # Moteur PixiJS (pixiEngine.ts, modifiers.ts, spatial-hash.ts…)
│   ├── store/           # Zustand store (params.ts)
│   ├── styles/          # Feuilles de style
│   └── main.tsx         # Point d’entrée React
├── index.html           # Page racine
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 📦 Installation

Clone le dépôt et installe les dépendances :

```bash
git clone https://github.com/ton-username/interaction.git
cd interaction
npm install
```

---

## ▶️ Lancer en développement

```bash
npm run dev
```

Puis ouvre [http://localhost:5173](http://localhost:5173) dans ton navigateur.

---

## 🔨 Build en production

```bash
npm run build
npm run preview
```

---

## 📌 Roadmap

* [ ] Ajouter de nouveaux modifiers : polygonator, spiralor, alternator…
* [ ] Exposer L, C et vRef (OKLCH) dans l’UI pour contrôler la palette.
* [ ] Exporter le canvas en **PNG haute résolution**.
* [ ] Mode “galerie” pour sauvegarder et rejouer des configurations.

---

## 📄 Licence

Projet sous licence MIT — libre à toi de l’utiliser, le modifier et le partager.
