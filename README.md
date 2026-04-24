# 🍺 Buvette HBC La Fillière

Application web de gestion des buvettes du club sportif.

## Fonctionnalités

- **Import SumUp** — glisser-déposer l'export .xlsx hebdomadaire
- **Saisie des achats** — tickets de caisse avec répartition par produit fini
- **Bilan semaine** — tableau complet identique à votre fichier Excel
- **Historique** — navigation entre les semaines, comparaison saison
- **Produits** — volumes vendus, marges par article, filtres

---

## Installation et déploiement

### Étape 1 — Supabase

1. Aller sur [supabase.com](https://supabase.com) > votre projet
2. Cliquer sur **SQL Editor** > **New query**
3. Copier-coller le contenu de `supabase_schema.sql` et cliquer **Run**
4. Dans **Authentication > Users**, créer votre compte trésorier
5. Dans **Project Settings > API**, copier :
   - `Project URL` → valeur de `VITE_SUPABASE_URL`
   - `anon public key` → valeur de `VITE_SUPABASE_ANON_KEY`

### Étape 2 — GitHub

1. Créer un nouveau dépôt GitHub (ex: `buvette-hbc`)
2. Dans **Settings > Secrets and variables > Actions**, ajouter :
   - Secret `VITE_SUPABASE_URL` → votre URL Supabase
   - Secret `VITE_SUPABASE_ANON_KEY` → votre clé anonyme
3. Dans **Settings > Pages** :
   - Source : **GitHub Actions**
4. Pousser ce code sur la branche `main` :

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/VOTRE_PSEUDO/buvette-hbc.git
git push -u origin main
```

5. L'application se déploie automatiquement. L'URL sera :
   `https://VOTRE_PSEUDO.github.io/buvette-hbc/`

### Étape 3 — Utilisation hebdomadaire

Chaque semaine :

1. **Créer la semaine** → onglet "Semaines" > + Nouvelle semaine
2. **Importer SumUp** → onglet "Import SumUp" > glisser le .xlsx
3. **Saisir les achats** → onglet "Saisie achats" > ajouter chaque ticket
4. **Consulter le bilan** → onglet "Bilan semaine" > imprimer ou partager

---

## Développement local

```bash
# Copier le fichier d'environnement
cp .env.example .env
# Renseigner vos clés Supabase dans .env

# Installer les dépendances
npm install

# Lancer en local
npm run dev
```

---

## Structure du projet

```
src/
├── lib/
│   ├── supabase.js      # Client Supabase
│   ├── auth.jsx         # Contexte d'authentification
│   └── sumup.js         # Parser fichiers SumUp
├── components/
│   ├── Layout.jsx        # Sidebar + navigation
│   └── SemaineSelector.jsx
├── pages/
│   ├── Login.jsx
│   ├── Dashboard.jsx    # KPIs + graphiques
│   ├── Import.jsx       # Import SumUp
│   ├── Achats.jsx       # Saisie des achats
│   ├── Bilan.jsx        # Bilan hebdomadaire complet
│   ├── Historique.jsx   # Vue saison
│   ├── Produits.jsx     # Analyse par produit
│   └── Semaines.jsx     # Gestion des semaines
└── index.css
```

## Base de données (Supabase)

| Table | Description |
|-------|-------------|
| `semaines` | Périodes de buvette avec thème et caisse |
| `ventes` | Données brutes importées depuis SumUp |
| `achats` | Tickets de caisse saisis manuellement |
| `imputations` | Répartition des coûts par produit fini |
| `produits` | Référentiel des articles avec catégories |
