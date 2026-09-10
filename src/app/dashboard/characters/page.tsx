"use client";

import { useEffect, useState, FormEvent } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Character {
  id: string;
  name: string;
  description: string;
  age: string | null;
  style: string | null;
}

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/characters").then((r) => r.json()).then((d) => setCharacters(d.characters ?? []));
  }

  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? "Could not save character.");
        return;
      }
      setName("");
      setDescription("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    await fetch(`/api/characters/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="mb-1 text-xl font-semibold">Characters</h1>
        <p className="mb-6 text-sm text-muted">
          Save a canonical character description here to keep reusing it. Injecting it automatically
          into scene-by-scene generation prompts for consistency is on the roadmap - see PRODUCT_SPEC.md.
        </p>
        {characters.length === 0 ? (
          <Card>
            <CardBody className="py-10 text-center text-sm text-muted">
              No characters yet. Create one to reuse across videos.
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {characters.map((c) => (
              <Card key={c.id}>
                <CardBody>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="font-medium">{c.name}</h3>
                    <button onClick={() => onDelete(c.id)} className="text-xs text-danger hover:underline">
                      Delete
                    </button>
                  </div>
                  <p className="line-clamp-3 text-sm text-muted">{c.description}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="h-fit">
        <CardBody>
          <h3 className="mb-3 font-semibold">New character</h3>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="char-name">Name</Label>
              <Input id="char-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="char-desc">Canonical description</Label>
              <Textarea
                id="char-desc"
                required
                rows={4}
                placeholder="24-year-old man, short messy black hair, light stubble, dark gray t-shirt, black sweatpants"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" loading={saving}>
              Save character
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
