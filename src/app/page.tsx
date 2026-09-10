import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { brand } from "@/config/brand";

const STEPS = [
  { title: "Describe your idea", body: "One sentence is enough. Pick a format, duration, and visual style." },
  { title: "Watch it get made", body: "Script, scene visuals, voiceover, and captions generate in a live pipeline you can leave running." },
  { title: "Download or refine", body: "Get an MP4 immediately, or switch to Advanced mode to edit scenes, prompts, and voice." },
];

const FORMATS = [
  { label: "9:16", body: "Shorts, Reels, TikTok" },
  { label: "16:9", body: "YouTube, landscape" },
  { label: "1:1", body: "Feed posts" },
  { label: "4:5", body: "Portrait feed posts" },
];

const FAQS = [
  {
    q: "Do I need to know FFmpeg, prompts, or video editing?",
    a: "No. Quick Create hides all of that. Advanced mode exposes per-scene prompts and settings if you want them.",
  },
  {
    q: "What happens to my credits if a generation fails?",
    a: "Credits are reserved up front and automatically refunded for any part of the job that didn't actually run.",
  },
  {
    q: "Can I see exactly what a video will cost before generating?",
    a: "Yes — Quick Create shows an estimated credit range broken down by operation before you confirm.",
  },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  const primaryHref = user ? "/dashboard/create" : "/signup";

  return (
    <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <nav className="mb-16 flex items-center justify-between">
        <span className="text-lg font-semibold">{brand.name}</span>
        <div className="flex items-center gap-3">
          {user ? (
            <Link href="/dashboard" className="text-sm font-medium text-muted hover:text-fg">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-muted hover:text-fg">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
              >
                Sign up free
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="mb-24 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Turn an idea into a finished video.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
          {brand.name} writes the script, generates the visuals and voiceover, adds captions,
          and renders a publish-ready MP4 — from a single sentence.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href={primaryHref}
            className="rounded-lg bg-accent px-6 py-3 text-base font-medium text-accent-fg hover:opacity-90"
          >
            Create a video
          </Link>
          <Link
            href={user ? "/dashboard/templates" : "/signup"}
            className="rounded-lg border border-border bg-surface px-6 py-3 text-base font-medium hover:bg-bg"
          >
            Explore templates
          </Link>
        </div>
      </section>

      <section className="mb-24 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="rounded-card border border-border bg-surface p-6">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
              {i + 1}
            </div>
            <h3 className="mb-1.5 font-semibold">{step.title}</h3>
            <p className="text-sm text-muted">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="mb-24">
        <h2 className="mb-6 text-center text-2xl font-semibold">Every format you publish to</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {FORMATS.map((f) => (
            <div key={f.label} className="rounded-card border border-border bg-surface p-6 text-center">
              <div className="mb-1 text-xl font-semibold">{f.label}</div>
              <div className="text-sm text-muted">{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-24 mx-auto max-w-2xl">
        <h2 className="mb-6 text-center text-2xl font-semibold">Frequently asked</h2>
        <div className="space-y-4">
          {FAQS.map((faq) => (
            <div key={faq.q} className="rounded-card border border-border bg-surface p-5">
              <h3 className="mb-1.5 font-medium">{faq.q}</h3>
              <p className="text-sm text-muted">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border pt-8 text-center text-sm text-muted">
        {brand.name} — {brand.tagline}
      </footer>
    </main>
  );
}
