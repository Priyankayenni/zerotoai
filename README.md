# ZeroToAI 🚀

A full-stack learning platform taking students from zero Python knowledge to ML engineer.
Built with React + Vite + TypeScript + Supabase + Framer Motion.
[Live Demo](https://zerotoai-six.vercel.app/) *(Update after deployment)*

## Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Framer Motion
- **Backend**: Supabase (Postgres + Auth + RLS)
- **Deploy**: Vercel (frontend) — no separate server needed

## Setup in 3 steps

### 1. Supabase
- Create a project at supabase.com
- Go to SQL Editor → run the contents of `supabase/schema.sql`
- Copy your Project URL and anon key from Settings → API

### 2. Local dev
```bash
cp .env.example .env
# Paste your Supabase URL and anon key into .env
npm install
npm run dev
```

### 3. Deploy to Vercel
- Push to GitHub (make sure .env is in .gitignore)
- Import repo on vercel.com
- Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as environment variables
- Deploy → share the link with your college

## Features
- 18 phases: Python (11) + Math (3) + ML (3) + Projects (1)
- Real-time leaderboard with Supabase
- Auth: sign up / sign in with email
- Progress syncs across devices when logged in
- Works offline too (localStorage fallback)
- Phase detail modal with practice exercises
- Track breakdown with animated progress bars
- Streak counter
- Search + filter phases
- Mobile responsive
- Framer Motion animations throughout

## Cost
₹0 — Supabase free tier + Vercel free tier

Built by a student, for students. Based on the 30 MIN PDF by Bunny.
