# Restaurant POS System (SEOUL PRAGUE)

Next.js restaurant POS with floor map, KDS, bar display, online reservations, and Supabase backend.

## Project structure

```
restaurant-pos-system/
├── pos-app/          ← Next.js app (deploy this folder on Vercel)
│   ├── app/
│   ├── components/
│   ├── supabase/     ← SQL patches (run in Supabase SQL editor)
│   └── ...
└── database_updates.sql
```

## Local development

```bash
cd pos-app
cp .env.example .env.local   # Windows: copy .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Routes:** `/` (main POS) · `/reservation` (public booking) · `/kds` · `/bar` · `/server` · `/client`

## Supabase setup

Run these in the Supabase SQL editor (in order):

1. `pos-app/supabase/patch-reservations.sql`
2. `pos-app/supabase/patch-reservations-late.sql`

## Deploy to GitHub + Vercel

### 1. Install Git

Download and install [Git for Windows](https://git-scm.com/download/win), then restart your terminal.

### 2. Create a GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. Name: e.g. `restaurant-pos-system`
3. **Do not** add README, .gitignore, or license (this repo already has them)
4. Click **Create repository**

### 3. Push code to GitHub

In PowerShell (replace `YOUR_USERNAME` and `YOUR_REPO`):

```powershell
cd C:\Users\admin\Desktop\restaurant-pos-system

git init
git add .
git commit -m "Initial commit: restaurant POS with reservations"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

> **Note:** `.env.local` is ignored and will **not** be pushed (secrets stay local).

### 4. Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. **Import** your GitHub repository
3. Configure the project:
   - **Framework Preset:** Next.js
   - **Root Directory:** `pos-app` ← important
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `.next` (default)
4. **Environment Variables** (Production + Preview):

   | Name | Value |
   |------|--------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

   Get values from: Supabase → Project Settings → API

5. Click **Deploy**

After deploy, your app will be live at `https://your-project.vercel.app`

- Public booking: `https://your-project.vercel.app/reservation`
- Main POS: `https://your-project.vercel.app/`

### 5. Redeploy after changes

Push to `main` on GitHub — Vercel redeploys automatically.

## Demo manager PIN

Default manager PIN for protected actions: **1234** (Master Liu)
