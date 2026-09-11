"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Style {
  id: string;
  key: string;
  name: string;
}
interface Voice {
  id: string;
  name: string;
  gender: string | null;
  styleTags: string[];
}
interface Estimate {
  sceneCount: number;
  estimate: number;
  low: number;
  high: number;
  breakdown: Array<{ label: string; credits: number }>;
}

const DURATIONS = [20, 30, 40, 60, 180, 300, 600, 900, 1200];
const ASPECT_RATIOS = [
  { value: "RATIO_9_16", label: "9:16" },
  { value: "RATIO_16_9", label: "16:9" },
  { value: "RATIO_1_1", label: "1:1" },
  { value: "RATIO_4_5", label: "4:5" },
];

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} sec`;
  return `${Math.round(sec / 60)} min`;
}

export default function QuickCreatePage() {
  return (
    <Suspense fallback={null}>
      <QuickCreateForm />
    </Suspense>
  );
}

function QuickCreateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");
  const [idea, setIdea] = useState("");
  const [aspectRatio, setAspectRatio] = useState("RATIO_9_16");
  const [durationSec, setDurationSec] = useState(30);
  const [styleKey, setStyleKey] = useState<string | undefined>();
  const [voiceId, setVoiceId] = useState<string | undefined>();
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(false);

  const [styles, setStyles] = useState<Style[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clientRequestId = useMemo(
    () => `qc-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    [],
  );

  useEffect(() => {
    fetch("/api/styles").then((r) => r.json()).then((d) => setStyles(d.styles ?? []));
    fetch("/api/voices").then((r) => r.json()).then((d) => setVoices(d.voices ?? []));
  }, []);

  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/templates/${templateId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.template) return;
        if (d.template.description) setIdea(d.template.description);
        if (d.template.defaultDurationSec) setDurationSec(d.template.defaultDurationSec);
        if (d.template.defaultStyleKey) setStyleKey(d.template.defaultStyleKey);
      })
      .catch(() => {});
  }, [templateId]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch("/api/credits/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationSec, captionsEnabled, musicEnabled, sfxEnabled }),
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((d) => setEstimate(d.estimate ?? null))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [durationSec, captionsEnabled, musicEnabled, sfxEnabled]);

  async function onGenerate() {
    setError(null);
    if (idea.trim().length < 10) {
      setError("Describe your idea in at least a few words.");
      return;
    }
    setSubmitting(true);
    try {
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea,
          aspectRatio,
          durationSec,
          styleKey,
          voiceId,
          captionsEnabled,
          musicEnabled,
          sfxEnabled,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) {
        setError(createJson.message ?? "Could not create the project.");
        return;
      }

      const projectId = createJson.project.id;
      const genRes = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientRequestId }),
      });
      const genJson = await genRes.json();
      if (!genRes.ok) {
        setError(genJson.message ?? "Could not start generation.");
        return;
      }

      router.push(`/dashboard/projects/${projectId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardBody>
            <Label htmlFor="idea">What do you want to make?</Label>
            <Textarea
              id="idea"
              rows={4}
              placeholder="Create a creepy 60-second story about a man receiving a phone call from himself in the future."
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-5">
            <div>
              <Label>Format</Label>
              <div className="flex flex-wrap gap-2">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setAspectRatio(r.value)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                      aspectRatio === r.value
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted hover:bg-bg"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Duration</Label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDurationSec(d)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                      durationSec === d
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted hover:bg-bg"
                    }`}
                  >
                    {formatDuration(d)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Style</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStyleKey(undefined)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    !styleKey ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:bg-bg"
                  }`}
                >
                  Auto
                </button>
                {styles.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyleKey(s.key)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                      styleKey === s.key
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted hover:bg-bg"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Voice</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setVoiceId(undefined)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    !voiceId ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:bg-bg"
                  }`}
                >
                  Auto
                </button>
                {voices.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVoiceId(v.id)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                      voiceId === v.id
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted hover:bg-bg"
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={captionsEnabled} onChange={(e) => setCaptionsEnabled(e.target.checked)} />
                Captions
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={musicEnabled} onChange={(e) => setMusicEnabled(e.target.checked)} />
                Music
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sfxEnabled} onChange={(e) => setSfxEnabled(e.target.checked)} />
                Sound effects
              </label>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardBody>
            <h3 className="mb-3 font-semibold">Generation details</h3>
            {estimate ? (
              <>
                <ul className="mb-3 space-y-1.5 text-sm text-muted">
                  {estimate.breakdown.map((b) => (
                    <li key={b.label} className="flex justify-between">
                      <span>{b.label}</span>
                      <span>{b.credits}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border pt-3">
                  <div className="text-sm text-muted">Estimated cost</div>
                  <div className="text-2xl font-semibold">
                    {estimate.low}–{estimate.high} credits
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">Calculating...</p>
            )}
          </CardBody>
        </Card>

        {error && (
          <Card>
            <CardBody className="text-sm text-danger">{error}</CardBody>
          </Card>
        )}

        <Button size="lg" className="w-full" onClick={onGenerate} loading={submitting}>
          Generate video
        </Button>
      </div>
    </div>
  );
}
