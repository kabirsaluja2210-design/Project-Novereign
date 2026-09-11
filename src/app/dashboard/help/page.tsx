"use client";

import { useEffect, useState, FormEvent } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
}

const FAQ = [
  { q: "What happens to my credits if generation fails?", a: "Any reserved credits not actually spent are refunded automatically." },
  { q: "Can I use my own footage?", a: "Not in this build yet - Quick Create currently generates all visuals. See PRODUCT_SPEC.md roadmap." },
  { q: "Why is my image a solid color with text?", a: "You're on the built-in Mock image provider (no external API key configured). It produces real files so the whole pipeline works end-to-end; connect a real provider for photorealistic output." },
];

export default function HelpPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/support-tickets").then((r) => r.json()).then((d) => setTickets(d.tickets ?? []));
  }
  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message }),
      });
      setSubject("");
      setMessage("");
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="mb-4 text-xl font-semibold">Frequently asked</h1>
          <div className="space-y-3">
            {FAQ.map((f) => (
              <Card key={f.q}>
                <CardBody>
                  <h3 className="mb-1 font-medium">{f.q}</h3>
                  <p className="text-sm text-muted">{f.a}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-semibold">Your tickets</h2>
          {tickets.length === 0 ? (
            <p className="text-sm text-muted">No support tickets yet.</p>
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => (
                <Card key={t.id}>
                  <CardBody className="flex items-center justify-between py-3">
                    <span className="text-sm font-medium">{t.subject}</span>
                    <StatusBadge status={t.status} />
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Card className="h-fit">
        <CardBody>
          <h3 className="mb-3 font-semibold">Contact support</h3>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" required rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" loading={saving}>
              Submit ticket
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
