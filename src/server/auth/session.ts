import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { generateSessionToken, hashSessionToken } from "./crypto";
import type { User } from "@prisma/client";
import { UnauthorizedError, ForbiddenError } from "@/server/errors";

export { UnauthorizedError, ForbiddenError };

export const SESSION_COOKIE = "cf_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return token;
}

/** Returns the authenticated user for the current request, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let tokenHash: string;
  try {
    tokenHash = hashSessionToken(token);
  } catch {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }
  if (session.user.status !== "ACTIVE") {
    return null;
  }
  return session.user;
}

/** Throws UnauthorizedError if there is no valid session. Use in API routes/server actions. */
export async function requireSession(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export function requireRole(
  user: User,
  allowed: Array<User["role"]>,
): void {
  if (!allowed.includes(user.role)) {
    throw new ForbiddenError(`Role ${user.role} is not permitted`);
  }
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const tokenHash = hashSessionToken(token);
      await prisma.session.updateMany({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });
    } catch {
      // token hash failed (e.g. secret rotated) - nothing to revoke server-side
    }
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Ensures a project belongs to the given user; throws otherwise (prevents IDOR). */
export async function requireOwnedProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) {
    throw new ForbiddenError("Project not found or not owned by this user");
  }
  return project;
}

/** Ensures a job belongs to the given user; throws otherwise (prevents IDOR). */
export async function requireOwnedJob(jobId: string, userId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
  if (!job) {
    throw new ForbiddenError("Job not found or not owned by this user");
  }
  return job;
}
