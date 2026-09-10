import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { DashboardNav } from "@/components/dashboard/nav";
import { TopBar } from "@/components/dashboard/topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <DashboardNav role={user.role} />
      <div className="flex-1">
        <TopBar
          user={{ name: user.name, email: user.email, creditBalance: user.creditBalance }}
        />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
