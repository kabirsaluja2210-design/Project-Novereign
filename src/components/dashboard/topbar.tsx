"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function TopBar({
  user,
}: {
  user: { name: string | null; email: string; creditBalance: number };
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6">
      <div className="text-sm text-muted">{user.name ?? user.email}</div>
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/billing"
          className="rounded-full border border-border px-3 py-1 text-sm font-medium hover:bg-bg"
        >
          {user.creditBalance.toLocaleString()} credits
        </Link>
        <Button variant="ghost" size="sm" onClick={logout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
