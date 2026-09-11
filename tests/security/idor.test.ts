import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { requireOwnedProject, requireOwnedJob, ForbiddenError } from "@/server/auth/session";

/**
 * Directive §123: every project/job fetch must be scoped to the requesting
 * user. These tests assert that fetching another user's resource by id
 * throws rather than silently returning it (IDOR).
 */

let ownerId: string;
let attackerId: string;
let projectId: string;
let jobId: string;

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const owner = await prisma.user.create({ data: { email: `idor-owner-${suffix}@example.com` } });
  const attacker = await prisma.user.create({ data: { email: `idor-attacker-${suffix}@example.com` } });
  ownerId = owner.id;
  attackerId = attacker.id;

  const project = await prisma.project.create({
    data: {
      userId: ownerId,
      name: "Owner's private project",
      idea: "a secret idea",
      durationSec: 30,
    },
  });
  projectId = project.id;

  const job = await prisma.job.create({
    data: { userId: ownerId, projectId, status: "QUEUED" },
  });
  jobId = job.id;
});

afterAll(async () => {
  await prisma.job.deleteMany({ where: { user: { email: { contains: "idor-" } } } });
  await prisma.project.deleteMany({ where: { user: { email: { contains: "idor-" } } } });
  await prisma.user.deleteMany({ where: { email: { contains: "idor-" } } });
  await prisma.$disconnect();
});

describe("IDOR protection", () => {
  it("allows the owner to access their own project", async () => {
    await expect(requireOwnedProject(projectId, ownerId)).resolves.toMatchObject({ id: projectId });
  });

  it("blocks a different user from accessing the project by id", async () => {
    await expect(requireOwnedProject(projectId, attackerId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("blocks access to a project id that does not exist", async () => {
    await expect(requireOwnedProject("nonexistent-id", ownerId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows the owner to access their own job", async () => {
    await expect(requireOwnedJob(jobId, ownerId)).resolves.toMatchObject({ id: jobId });
  });

  it("blocks a different user from accessing the job by id", async () => {
    await expect(requireOwnedJob(jobId, attackerId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
