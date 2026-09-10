"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setName(d.user?.name ?? "");
        setEmail(d.user?.email ?? "");
      });
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function logoutAll() {
    await fetch("/api/auth/logout-all", { method: "POST" });
    router.push("/login");
  }

  async function deleteAccount() {
    if (!confirm("This will permanently disable your account. Continue?")) return;
    await fetch("/api/account", { method: "DELETE" });
    router.push("/");
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardBody>
          <h2 className="mb-4 font-semibold">Profile</h2>
          <form onSubmit={onSave} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled />
            </div>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
            {saved && <span className="ml-3 text-sm text-success">Saved</span>}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-2 font-semibold">Sessions</h2>
          <p className="mb-4 text-sm text-muted">Sign out of this browser, or every device you&apos;re signed in on.</p>
          <Button variant="secondary" onClick={logoutAll}>
            Log out of all devices
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-2 font-semibold text-danger">Danger zone</h2>
          <p className="mb-4 text-sm text-muted">
            Permanently disable your account. Your projects and history are retained per our data
            retention policy but your account can no longer log in.
          </p>
          <Button variant="danger" onClick={deleteAccount}>
            Delete account
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
