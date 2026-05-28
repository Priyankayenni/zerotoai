import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, Check, ChevronRight, Database,
  Flame, Lock, LogOut, Rocket, Search, Sparkles,
  Trophy, User, BookOpen, Target, Zap, Star,
  TrendingUp, Award, Brain, GitBranch, X
} from "lucide-react";
import { FormEvent, InputHTMLAttributes, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { Phase, Track, phases, trackOrder } from "./data/roadmap";

type Profile = { id: string; name: string; class: string | null };
type Leader = { id: string; name: string; class: string | null; completed: number };

const LOCAL_PROGRESS_KEY = "zerotoai.progress";
const LOCAL_PROFILE_KEY  = "zerotoai.profile";

const TRACK_COLOR: Record<string, string> = {
  Python:   "from-violet-400 to-fuchsia-400",
  Math:     "from-sky-400 to-cyan-400",
  ML:       "from-emerald-400 to-teal-400",
  Projects: "from-amber-400 to-orange-400",
};
const TRACK_BADGE: Record<string, string> = {
  Python:   "bg-violet-300/10 text-violet-200 border-violet-300/20",
  Math:     "bg-sky-300/10 text-sky-200 border-sky-300/20",
  ML:       "bg-emerald-300/10 text-emerald-200 border-emerald-300/20",
  Projects: "bg-amber-300/10 text-amber-200 border-amber-300/20",
};

const fallbackLeaders: Leader[] = [
  { id: "d1", name: "Top learner",       class: "Your class", completed: 14 },
  { id: "d2", name: "Consistent coder",  class: "Your class", completed: 10 },
  { id: "d3", name: "Math grinder",      class: "Your class", completed: 7  },
  { id: "d4", name: "Early starter",     class: "Your class", completed: 4  },
  { id: "d5", name: "Just begun",        class: "Your class", completed: 1  },
];

function getLocalProgress() {
  try { return new Set<string>(JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || "[]")); }
  catch { return new Set<string>(); }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const show = useCallback((msg: string, type: "success" | "error" | "info" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  return { toast, show };
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [profile,       setProfile]       = useState<Profile | null>(null);
  const [completed,     setCompleted]     = useState<Set<string>>(getLocalProgress);
  const [leaders,       setLeaders]       = useState<Leader[]>(fallbackLeaders);
  const [filter,        setFilter]        = useState<Track | "All">("All");
  const [query,         setQuery]         = useState("");
  const [authMode,      setAuthMode]      = useState<"signup" | "signin">("signup");
  const [authMessage,   setAuthMessage]   = useState("");
  const [isBusy,        setIsBusy]        = useState(false);
  const [activeSection, setActiveSection] = useState("top");
  const [showPhaseModal, setShowPhaseModal] = useState<Phase | null>(null);
  const { toast, show: showToast } = useToast();

  const progressPercent = Math.round((completed.size / phases.length) * 100);
  const pythonPhases    = phases.filter(p => p.track === "Python");
  const mathPhases      = phases.filter(p => p.track === "Math");
  const mlPhases        = phases.filter(p => p.track === "ML");
  const pythonDone      = pythonPhases.filter(p => completed.has(p.id)).length;
  const mathDone        = mathPhases.filter(p => completed.has(p.id)).length;
  const mlDone          = mlPhases.filter(p => completed.has(p.id)).length;
  const nextPhase       = phases.find(p => !completed.has(p.id)) ?? phases[phases.length - 1];
  const streak          = useMemo(() => Math.floor(completed.size * 1.3), [completed.size]);

  const filteredPhases = useMemo(() => phases.filter(p => {
    const matchTrack = filter === "All" || p.track === filter;
    const hay = `${p.title} ${p.track} ${p.outcome} ${p.focus.join(" ")}`.toLowerCase();
    return matchTrack && hay.includes(query.toLowerCase());
  }), [filter, query]);

  // nav highlight on scroll
  useEffect(() => {
    const ids = ["top", "dashboard", "roadmap", "leaderboard", "join", "publish"];
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); });
    }, { threshold: 0.35 });
    ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!supabase) {
      const saved = localStorage.getItem(LOCAL_PROFILE_KEY);
      if (saved) setProfile(JSON.parse(saved));
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSessionUserId(data.session?.user.id ?? null));
    const { data: l } = supabase.auth.onAuthStateChange((_e, s) => setSessionUserId(s?.user.id ?? null));
    return () => l.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (sessionUserId && supabase) void loadUserData(sessionUserId); }, [sessionUserId]);
  useEffect(() => { void loadLeaderboard(); }, [completed.size, sessionUserId]);

  async function loadUserData(userId: string) {
    if (!supabase) return;
    const [{ data: prof }, { data: prog }] = await Promise.all([
      supabase.from("profiles").select("id,name,class").eq("id", userId).maybeSingle(),
      supabase.from("progress").select("phase_id").eq("user_id", userId),
    ]);
    if (prof) setProfile(prof as Profile);
    if (prog) setCompleted(new Set(prog.map(r => r.phase_id as string)));
  }

  async function loadLeaderboard() {
    if (!supabase || !isSupabaseConfigured) { setLeaders(addLocalLeader(fallbackLeaders)); return; }
const { data, error } = await supabase
      .from("leaderboard")
      .select("user_id,name,completed_count")
      .order("completed_count", { ascending: false })
      .limit(10);
    if (error) return;
    if (!data) return;

    const next: Leader[] = (data as any[]).map(r => ({
      id: r.user_id as string,
      name: r.name as string,
      class: null, // class hidden for privacy
      completed: r.completed_count as number,
    }));

    setLeaders(next.length ? next : fallbackLeaders);
  }

  function addLocalLeader(base: Leader[]) {
    if (!profile) return base;
    const me: Leader = { id: profile.id, name: profile.name, class: profile.class, completed: completed.size };
    return [me, ...base.filter(l => l.id !== me.id)].sort((a, b) => b.completed - a.completed).slice(0, 10);
  }

  async function handleAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthMessage(""); setIsBusy(true);
    const fd = new FormData(e.currentTarget);
    const name      = String(fd.get("name") || "").trim();
    const className = String(fd.get("class") || "").trim();
    const email     = String(fd.get("email") || "").trim();
    const password  = String(fd.get("password") || "");
    try {
      if (!supabase) {
        const local: Profile = { id: crypto.randomUUID(), name: name || "Local learner", class: className || "Prototype" };
        localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(local));
        setProfile(local);
        showToast("Local profile created! Connect Supabase to sync across devices.", "info");
        return;
      }
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name, class: className } } });
        if (error) throw error;
        if (data.user?.id && data.session) {
          const p = { id: data.user.id, name, class: className };
          await supabase.from("profiles").upsert(p);
          setProfile(p);
          showToast(`Welcome, ${name.split(" ")[0]}! Let's get to work. 🔥`);
        }
        setAuthMessage("Account created! Check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showToast("Welcome back! Progress synced. 🚀");
        setAuthMessage("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setAuthMessage(msg); showToast(msg, "error");
    } finally { setIsBusy(false); }
  }

  async function togglePhase(phase: Phase) {
    const next = new Set(completed);
    const adding = !next.has(phase.id);
    if (adding) next.add(phase.id); else next.delete(phase.id);
    setCompleted(next);
    localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify([...next]));
    if (adding) showToast(`✓ ${phase.title} — phase complete!`);
    if (!supabase || !sessionUserId) return;
    if (adding) await supabase.from("progress").upsert({ user_id: sessionUserId, phase_id: phase.id });
    else await supabase.from("progress").delete().eq("user_id", sessionUserId).eq("phase_id", phase.id);
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSessionUserId(null); setProfile(null);
    setCompleted(getLocalProgress());
    showToast("Signed out.", "info");
  }

  const navLink = (id: string, label: string) => (
    <a href={`#${id}`}
      className={`text-sm font-bold transition-colors ${activeSection === id ? "text-white" : "text-stone-400 hover:text-white"}`}>
      {label}
    </a>
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#08080c] text-stone-100">
      <Background />

      {/* ── NAV ── */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/8 bg-[#08080c]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <a href="#top" className="font-display text-xl font-black tracking-tight">
            Zero<span className="text-violet-300">ToAI</span>
          </a>
          <div className="hidden items-center gap-7 md:flex">
            {navLink("roadmap",     "Roadmap")}
            {navLink("dashboard",   "Tracker")}
            {navLink("leaderboard", "Leaderboard")}
          </div>
          {profile
            ? <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-300 text-xs font-black text-black">
                    {profile.name[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-bold text-stone-300">{profile.name.split(" ")[0]}</span>
                </div>
                <button onClick={signOut} className="text-stone-400 transition hover:text-white"><LogOut size={17} /></button>
              </div>
            : <a href="#join" className="rounded-full bg-violet-300 px-4 py-2 text-sm font-black text-black transition hover:bg-white">
                Join free
              </a>
          }
        </div>
      </nav>

      {/* ── HERO ── */}
      <section id="top" className="relative flex min-h-screen items-center pt-16">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <motion.p
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/8 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.22em] text-violet-200"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
              <Sparkles size={13} /> Built for students who are done making excuses
            </motion.p>
            <h1 className="font-display text-5xl font-black leading-[0.9] tracking-[-0.055em] text-white sm:text-7xl lg:text-[5.5rem]">
              ZeroToAI
              <span className="block bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">learn hard.</span>
              <span className="block text-stone-500">ship proof.</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-stone-300">
              From absolute beginner to ML engineer. Structured phases, real progress tracking, class leaderboard, and an AI roadmap your college has never seen.
            </p>

            {/* hero stats */}
            <div className="mt-8 flex flex-wrap gap-5">
              {[
                { val: `${phases.length}`, label: "Phases", icon: <Target size={14}/> },
                { val: "6 mo",             label: "Timeline",icon: <TrendingUp size={14}/> },
                { val: "2 hrs",            label: "Per day", icon: <Zap size={14}/> },
                { val: "₹0",              label: "Cost",    icon: <Star size={14}/> },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/4 px-4 py-2">
                  <span className="text-violet-300">{s.icon}</span>
                  <span className="font-display text-xl font-black">{s.val}</span>
                  <span className="text-sm text-stone-500">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#join"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-violet-300 px-7 py-3.5 font-black text-black transition hover:bg-white">
                Start the roadmap <ArrowRight className="transition group-hover:translate-x-1" size={18} />
              </a>
              <a href="#roadmap"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 px-7 py-3.5 font-bold text-white transition hover:border-white/30 hover:bg-white/5">
                <BookOpen size={16}/> View phases
              </a>
            </div>
          </motion.div>

          <motion.div className="relative hidden lg:block" style={{ minHeight: 560 }}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.15 }}>
            <VisualRoadmap completed={completed} onPhaseClick={setShowPhaseModal} />
          </motion.div>
        </div>
      </section>

      {/* ── DASHBOARD ── */}
      <section id="dashboard" className="mx-auto max-w-7xl px-5 py-24">
        <SectionIntro label="Your command centre" title="One screen. Everything you need to know." />

        <div className="grid gap-5 lg:grid-cols-3">
          {/* progress card */}
          <motion.div className="col-span-1 rounded-[2rem] border border-white/10 bg-white/4 p-6 backdrop-blur"
            whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 240, damping: 24 }}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-500">Signed in as</p>
                <h3 className="font-display text-2xl font-black">{profile?.name ?? "Guest learner"}</h3>
                {profile?.class && <p className="text-sm text-stone-500">{profile.class}</p>}
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 text-black">
                <User size={21} />
              </div>
            </div>
            <div className="relative mb-4 h-3 overflow-hidden rounded-full bg-white/8">
              <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-300 via-fuchsia-300 to-emerald-300"
                initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 1 }} />
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="font-display text-5xl font-black">{progressPercent}%</p>
                <p className="text-sm text-stone-400">{completed.size} / {phases.length} phases</p>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-amber-300/20 bg-amber-300/8 px-3 py-1.5">
                <Flame size={14} className="text-amber-300" />
                <span className="text-sm font-bold text-amber-200">{streak} day streak</span>
              </div>
            </div>
          </motion.div>

          {/* track breakdown */}
          <motion.div className="col-span-1 rounded-[2rem] border border-white/10 bg-white/4 p-6"
            initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-stone-500">Track breakdown</p>
            {[
              { label: "Python",   done: pythonDone,  total: pythonPhases.length, color: "from-violet-400 to-fuchsia-400" },
              { label: "Math",     done: mathDone,    total: mathPhases.length,   color: "from-sky-400 to-cyan-400" },
              { label: "ML",       done: mlDone,      total: mlPhases.length,     color: "from-emerald-400 to-teal-400" },
            ].map(t => (
              <div key={t.label} className="mb-4 last:mb-0">
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-bold">{t.label}</span>
                  <span className="text-stone-400">{t.done}/{t.total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/8">
                  <motion.div className={`h-full rounded-full bg-gradient-to-r ${t.color}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${t.total > 0 ? Math.round(t.done/t.total*100) : 0}%` }}
                    transition={{ duration: 0.8 }} />
                </div>
              </div>
            ))}
          </motion.div>

          {/* focus now */}
          <motion.div className="col-span-1 rounded-[2rem] border border-violet-300/20 bg-violet-300/6 p-6"
            initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-violet-200">
              <Flame size={14} /> Focus now
            </p>
            <h3 className="font-display text-2xl font-black tracking-tight leading-tight">{nextPhase.title}</h3>
            <p className="mt-3 text-sm leading-6 text-stone-300">{nextPhase.outcome}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {nextPhase.focus.slice(0, 3).map(f => (
                <span key={f} className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-stone-300">{f}</span>
              ))}
            </div>
            <button onClick={() => setShowPhaseModal(nextPhase)}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-violet-300/15 px-4 py-2 text-sm font-bold text-violet-200 transition hover:bg-violet-300/25">
              View full phase <ChevronRight size={15}/>
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── ROADMAP ── */}
      <section id="roadmap" className="mx-auto max-w-7xl px-5 py-24">
        <SectionIntro label="The path" title="Python first. Math parallel. ML after the gate." />

        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["All", ...trackOrder] as const).map(t => (
              <button key={t} onClick={() => setFilter(t as Track | "All")}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  filter === t ? "bg-white text-black" : "border border-white/10 text-stone-300 hover:bg-white/5"
                }`}>
                {t}
                <span className="ml-2 text-xs opacity-60">
                  {t === "All" ? phases.length : phases.filter(p => p.track === t).length}
                </span>
              </button>
            ))}
          </div>
          <label className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/4 px-4 py-2.5 text-stone-400 lg:w-72">
            <Search size={16} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search phases…"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-stone-500" />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search">
                <X size={14} className="text-stone-500 hover:text-white" />
              </button>
            )}
          </label>
        </div>

        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredPhases.length
              ? filteredPhases.map(p => (
                  <PhaseRow key={p.id} phase={p} isDone={completed.has(p.id)}
                    onToggle={() => void togglePhase(p)} onExpand={() => setShowPhaseModal(p)} />
                ))
              : <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="py-12 text-center text-stone-500">No phases match your search.</motion.p>
            }
          </AnimatePresence>
        </div>
      </section>

      {/* ── LEADERBOARD ── */}
      <section id="leaderboard" className="mx-auto max-w-7xl px-5 py-24">
        <SectionIntro label="Your college" title="A leaderboard that rewards consistency." />
        <div className="grid gap-5 lg:grid-cols-[1fr_0.7fr]">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/4">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <p className="font-display text-lg font-black">Top learners</p>
              <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-300">
                {isSupabaseConfigured ? "Live" : "Demo"}
              </span>
            </div>
            {leaders.map((l, i) => (
              <LeaderRow key={l.id} leader={l} rank={i + 1} isMe={l.id === profile?.id} total={phases.length} />
            ))}
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-300/5 p-6">
              <Trophy className="mb-4 text-emerald-200" size={30} />
              <h3 className="font-display text-2xl font-black">No fake progress.</h3>
              <p className="mt-3 text-sm leading-6 text-stone-400">
                Mark a phase done only when you can redo every practice exercise from scratch without looking. That's the rule. That's what keeps this honest.
              </p>
            </div>
            <div className="rounded-[2rem] border border-violet-300/20 bg-violet-300/5 p-6">
              <Brain className="mb-4 text-violet-200" size={30} />
              <h3 className="font-display text-2xl font-black">The 2-hour rule.</h3>
              <p className="mt-3 text-sm leading-6 text-stone-400">
                2 hours a day, every day, for 6 months. That's it. Not 8 hours on weekends. Not "I'll start Monday." Consistency beats intensity every time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── JOIN ── */}
      <section id="join" className="mx-auto max-w-7xl px-5 py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div>
            <SectionIntro label="Join" title="Create your learner profile." />
            <div className="mt-6 space-y-4">
              {[
                { icon: <Check size={16}/>, text: "Track all 17+ phases with real progress sync" },
                { icon: <Check size={16}/>, text: "Appear on your college leaderboard" },
                { icon: <Check size={16}/>, text: "Progress saves across all your devices" },
                { icon: <Check size={16}/>, text: "Free forever — no credit card needed" },
              ].map(f => (
                <div key={f.text} className="flex items-center gap-3 text-sm text-stone-300">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-300">{f.icon}</span>
                  {f.text}
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleAuth} className="rounded-[2rem] border border-white/10 bg-white/4 p-7">
            <div className="mb-6 flex rounded-full border border-white/10 p-1">
              {(["signup", "signin"] as const).map(m => (
                <button type="button" key={m} onClick={() => { setAuthMode(m); setAuthMessage(""); }}
                  aria-label={m === "signup" ? "Sign up" : "Sign in"}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-black capitalize transition ${authMode === m ? "bg-white text-black" : "text-stone-400 hover:text-white"}`}>
                  {m === "signup" ? "Sign up" : "Sign in"}
                </button>
              ))}
            </div>

            {authMode === "signup" && (
              <div className="mb-3 grid gap-3 sm:grid-cols-2">
                <AuthInput name="name"  label="Your name"  placeholder="e.g. Arjun" required />
                <AuthInput name="class" label="Class/Batch" placeholder="e.g. CSE-B 2025" />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <AuthInput name="email"    type="email"    label="Email"    placeholder="you@college.edu" required={Boolean(supabase)} />
              <AuthInput name="password" type="password" label="Password" placeholder="Min 6 characters" required={Boolean(supabase)} />
            </div>

            <button disabled={isBusy}
              className="mt-5 w-full rounded-full bg-violet-300 py-3.5 font-black text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
              {isBusy ? "Working…" : authMode === "signup" ? "Create profile →" : "Sign in →"}
            </button>

            <p className={`mt-4 min-h-5 text-sm ${authMessage.includes("error") || authMessage.includes("wrong") ? "text-red-400" : "text-stone-400"}`}>
              {authMessage || (isSupabaseConfigured ? "✓ Supabase connected — progress syncs across devices." : "Running in prototype mode — progress saves locally.")}
            </p>
          </form>
        </div>
      </section>



      <footer className="border-t border-white/8 px-5 py-10 text-center text-sm text-stone-600">
        ZeroToAI — built for students, by a student. Based on the <span className="text-violet-300">30 MIN</span> PDF by Bunny.
        <br /><span className="text-xs opacity-50">React + Vite · TypeScript · Supabase · Framer Motion · Deploy on Vercel</span>
      </footer>

      {/* ── PHASE DETAIL MODAL ── */}
      <AnimatePresence>
        {showPhaseModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-5"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowPhaseModal(null)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div className="relative w-full max-w-lg rounded-[2rem] border border-white/12 bg-[#111118] p-7 shadow-2xl"
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowPhaseModal(null)} aria-label="Close phase modal" className="absolute right-5 top-5 text-stone-500 hover:text-white"><X size={20}/></button>
              <span className={`inline-block rounded-full border px-3 py-1 text-xs font-bold ${TRACK_BADGE[showPhaseModal.track] ?? ""}`}>
                {showPhaseModal.track}
              </span>
              <h2 className="font-display mt-3 text-3xl font-black tracking-tight">{showPhaseModal.title}</h2>
              <p className="mt-1 text-sm text-stone-500">{showPhaseModal.duration}</p>
              <p className="mt-4 text-stone-300">{showPhaseModal.outcome}</p>
              <div className="mt-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-stone-500">Topics</p>
                <div className="flex flex-wrap gap-2">
                  {showPhaseModal.focus.map(f => (
                    <span key={f} className="rounded-full border border-white/10 px-3 py-1 text-sm text-stone-300">{f}</span>
                  ))}
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-violet-300/15 bg-violet-300/5 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-violet-200">Practice</p>
                <p className="mt-1.5 text-sm text-stone-300">{showPhaseModal.practice}</p>
              </div>
              {showPhaseModal.resource && (
                <p className="mt-4 text-sm text-sky-300">📖 Resource: {showPhaseModal.resource}</p>
              )}
              <button
                onClick={() => { void togglePhase(showPhaseModal); setShowPhaseModal(null); }}
                className={`mt-6 w-full rounded-full py-3 font-black transition ${
                  completed.has(showPhaseModal.id) ? "bg-emerald-300 text-black hover:bg-emerald-200" : "bg-violet-300 text-black hover:bg-white"
                }`}>
                {completed.has(showPhaseModal.id) ? "✓ Mark incomplete" : "Mark as done"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOAST ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-3 text-sm font-bold shadow-xl ${
              toast.type === "error" ? "bg-red-500 text-white" :
              toast.type === "info"  ? "bg-stone-700 text-white" :
              "bg-emerald-300 text-black"
            }`}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0,  scale: 1   }}
            exit={{    opacity: 0, y: 20, scale: 0.9 }}>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(139,92,246,0.22),transparent_32%),radial-gradient(circle_at_82%_18%,rgba(45,212,191,0.12),transparent_28%),radial-gradient(circle_at_55%_88%,rgba(244,114,182,0.14),transparent_32%)]" />
      <motion.div className="absolute inset-0 opacity-[0.1]"
        animate={{ backgroundPosition: ["0px 0px", "80px 80px"] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)",
          backgroundSize: "80px 80px",
        }} />
    </div>
  );
}

function VisualRoadmap({ completed, onPhaseClick }: { completed: Set<string>; onPhaseClick: (p: Phase) => void }) {
  const nodes = phases.slice(0, 10);
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] border border-white/10 bg-black/25 p-5 shadow-2xl shadow-violet-950/50">
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Live roadmap</p>
          <p className="font-display text-lg font-black">Python → Math → ML</p>
        </div>
        <div className="rounded-full bg-emerald-300/12 px-3 py-1 text-xs font-bold text-emerald-200">
          {completed.size}/{phases.length} done
        </div>
      </div>
      <div className="space-y-2.5">
        {nodes.map((p, i) => (
          <motion.button key={p.id} onClick={() => onPhaseClick(p)}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition ${
              completed.has(p.id) ? "border-emerald-300/20 bg-emerald-300/8" : "border-white/8 bg-white/4 hover:bg-white/7"
            }`}
            initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-black ${
              completed.has(p.id) ? "bg-emerald-300 text-black" : "bg-white/8 text-stone-400"
            }`}>
              {completed.has(p.id) ? <Check size={14}/> : i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{p.title}</p>
              <p className="text-xs text-stone-500">{p.track} · {p.duration}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function SectionIntro({ label, title }: { label: string; title: string }) {
  return (
    <motion.div className="mb-10" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-violet-300">{label}</p>
      <h2 className="font-display max-w-3xl text-4xl font-black leading-tight tracking-[-0.04em] md:text-5xl">{title}</h2>
    </motion.div>
  );
}

function PhaseRow({ phase, isDone, onToggle, onExpand }: { phase: Phase; isDone: boolean; onToggle: () => void; onExpand: () => void }) {
  return (
    <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className={`grid gap-5 rounded-[1.5rem] border p-5 transition md:grid-cols-[150px_1fr_auto] md:items-center ${
        isDone ? "border-emerald-300/20 bg-emerald-300/5" : "border-white/8 bg-white/3 hover:bg-white/5"
      }`}>
      <div>
        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${TRACK_BADGE[phase.track] ?? ""}`}>{phase.track}</span>
        <p className="mt-2 text-sm text-stone-500">{phase.duration}</p>
      </div>
      <div>
        <h3 className="font-display text-xl font-black tracking-tight">{phase.title}</h3>
        <p className="mt-1 text-sm text-stone-400">{phase.outcome}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {phase.focus.slice(0, 4).map(f => (
            <span key={f} className="rounded-full border border-white/8 px-2.5 py-0.5 text-xs text-stone-400">{f}</span>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onExpand}
          className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-bold text-stone-400 transition hover:border-white/20 hover:text-white">
          Details
        </button>
        <button onClick={onToggle}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-black transition ${
            isDone ? "bg-emerald-300 text-black hover:bg-emerald-200" : "bg-white text-black hover:bg-violet-200"
          }`}>
          {isDone ? <><Check size={16}/> Done</> : <><Lock size={15}/> Mark done</>}
        </button>
      </div>
    </motion.article>
  );
}

function LeaderRow({ leader, rank, isMe, total }: { leader: Leader; rank: number; isMe: boolean; total: number }) {
  const pct = Math.round(leader.completed / total * 100);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className={`grid grid-cols-[44px_1fr_80px_60px] items-center gap-4 border-b border-white/8 px-6 py-4 last:border-b-0 ${isMe ? "bg-violet-300/5" : ""}`}>
      <div className="font-display text-xl font-black text-stone-500">{medals[rank - 1] ?? rank}</div>
      <div>
        <p className={`font-bold ${isMe ? "text-violet-200" : "text-white"}`}>{leader.name} {isMe && <span className="ml-1 text-xs text-violet-300">(you)</span>}</p>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-emerald-400"
          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
      </div>
      <div className="text-right">
        <p className="font-display text-xl font-black">{leader.completed}</p>
        <p className="text-xs text-stone-500">phases</p>
      </div>
    </div>
  );
}

function AuthInput({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-stone-400">{label}</span>
      <input {...props} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-600 focus:border-violet-300" />
    </label>
  );
}

function LaunchCard({ icon, step, title, text, color }: { icon: React.ReactNode; step: string; title: string; text: string; color: string }) {
  return (
    <motion.div className="rounded-[2rem] border border-white/10 bg-white/4 p-6"
      whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 240, damping: 24 }}>
      <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${color} text-black`}>{icon}</div>
      <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Step {step}</p>
      <h3 className="font-display mt-1 text-2xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-stone-400">{text}</p>
    </motion.div>
  );
}
