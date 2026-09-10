import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // -------------------------------------------------------------------
  // Plans (directive §43/§230) - values are illustrative defaults, not a
  // number-for-number copy of any competitor's pricing; all admin-editable.
  // -------------------------------------------------------------------
  const plans = [
    {
      key: "FREE",
      name: "Free",
      monthlyCredits: 150,
      priceCentsMonthly: 0,
      maxVideoDurationSec: 60,
      maxSocialAccounts: 0,
      priorityWeight: 1,
      entitlements: {
        AUTOMATION: false,
        LONG_VIDEO: false,
        SOCIAL_INSTAGRAM: false,
        THREE_D: false,
        VOICE_CLONING: false,
        MULTIPLE_ACCOUNTS: false,
      },
    },
    {
      key: "STARTER",
      name: "Starter",
      monthlyCredits: 1000,
      priceCentsMonthly: 1900,
      maxVideoDurationSec: 180,
      maxSocialAccounts: 1,
      priorityWeight: 2,
      entitlements: {
        AUTOMATION: false,
        LONG_VIDEO: false,
        SOCIAL_INSTAGRAM: true,
        THREE_D: false,
        VOICE_CLONING: false,
        MULTIPLE_ACCOUNTS: false,
      },
    },
    {
      key: "PRO",
      name: "Pro",
      monthlyCredits: 4000,
      priceCentsMonthly: 4900,
      maxVideoDurationSec: 600,
      maxSocialAccounts: 3,
      priorityWeight: 3,
      entitlements: {
        AUTOMATION: true,
        LONG_VIDEO: true,
        SOCIAL_INSTAGRAM: true,
        THREE_D: false,
        VOICE_CLONING: false,
        MULTIPLE_ACCOUNTS: true,
      },
    },
    {
      key: "ADVANCED",
      name: "Advanced",
      monthlyCredits: 10000,
      priceCentsMonthly: 9900,
      maxVideoDurationSec: 1200,
      maxSocialAccounts: 10,
      priorityWeight: 4,
      entitlements: {
        AUTOMATION: true,
        LONG_VIDEO: true,
        SOCIAL_INSTAGRAM: true,
        THREE_D: true,
        VOICE_CLONING: true,
        MULTIPLE_ACCOUNTS: true,
      },
    },
    {
      key: "ENTERPRISE",
      name: "Enterprise",
      monthlyCredits: 40000,
      priceCentsMonthly: 0, // custom - handled outside self-serve billing
      maxVideoDurationSec: 1800,
      maxSocialAccounts: 100,
      priorityWeight: 5,
      entitlements: {
        AUTOMATION: true,
        LONG_VIDEO: true,
        SOCIAL_INSTAGRAM: true,
        THREE_D: true,
        VOICE_CLONING: true,
        MULTIPLE_ACCOUNTS: true,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      update: plan,
      create: plan,
    });
  }

  // -------------------------------------------------------------------
  // Styles (directive §50)
  // -------------------------------------------------------------------
  const styles = [
    { key: "realistic_4k", name: "4K Realistic", category: "photorealistic", promptSuffix: "photorealistic, 4k, sharp detail, natural lighting" },
    { key: "cinematic", name: "Cinematic", category: "cinematic", promptSuffix: "cinematic lighting, anamorphic lens, film grain, dramatic composition" },
    { key: "three_d_cartoon", name: "3D Cartoon", category: "3d", promptSuffix: "3d rendered, pixar-style shading, vibrant colors, soft global illumination" },
    { key: "anime", name: "Anime", category: "anime", promptSuffix: "anime style, cel shaded, expressive linework" },
    { key: "claymation", name: "Clay", category: "clay", promptSuffix: "claymation, stop-motion texture, handcrafted look" },
    { key: "comic", name: "Comic", category: "comic", promptSuffix: "comic book style, bold ink outlines, halftone shading" },
    { key: "watercolor", name: "Watercolor", category: "watercolor", promptSuffix: "watercolor painting, soft edges, paper texture" },
    { key: "minimal", name: "Minimal", category: "minimal", promptSuffix: "minimalist flat illustration, limited palette, clean shapes" },
  ];
  for (const style of styles) {
    await prisma.style.upsert({ where: { key: style.key }, update: style, create: style });
  }

  // -------------------------------------------------------------------
  // Voices - mock provider catalog so Quick Create has real choices without
  // any external API key configured (directive §23).
  // -------------------------------------------------------------------
  const voices = [
    { provider: "mock", providerVoiceId: "mock-female-warm-en", name: "Ava", gender: "female", ageCategory: "adult", language: "en", accent: "US", styleTags: ["natural", "narrator"] },
    { provider: "mock", providerVoiceId: "mock-male-deep-en", name: "Marcus", gender: "male", ageCategory: "adult", language: "en", accent: "US", styleTags: ["cinematic", "serious"] },
    { provider: "mock", providerVoiceId: "mock-female-energetic-en", name: "Zoe", gender: "female", ageCategory: "young_adult", language: "en", accent: "UK", styleTags: ["energetic"] },
    { provider: "mock", providerVoiceId: "mock-male-calm-en", name: "Theo", gender: "male", ageCategory: "adult", language: "en", accent: "UK", styleTags: ["calm", "educational"] },
    { provider: "mock", providerVoiceId: "mock-narrator-horror-en", name: "Raven", gender: "female", ageCategory: "adult", language: "en", accent: "US", styleTags: ["horror", "cinematic"] },
  ];
  for (const voice of voices) {
    const existing = await prisma.voice.findFirst({
      where: { provider: voice.provider, providerVoiceId: voice.providerVoiceId },
    });
    if (!existing) {
      await prisma.voice.create({ data: voice });
    }
  }

  // -------------------------------------------------------------------
  // Templates (directive §49)
  // -------------------------------------------------------------------
  const templates = [
    { name: "Creepy Phone Call", category: "Horror", description: "A late-night call that shouldn't be possible.", sceneCount: 6, defaultDurationSec: 30, defaultStyleKey: "cinematic", isPublic: true },
    { name: "Science in 60 Seconds", category: "Education", description: "One surprising scientific fact, explained fast.", sceneCount: 5, defaultDurationSec: 45, defaultStyleKey: "realistic_4k", isPublic: true },
    { name: "History Mini-Documentary", category: "History", description: "A forgotten moment in history, retold.", sceneCount: 6, defaultDurationSec: 60, defaultStyleKey: "cinematic", isPublic: true },
    { name: "Finance Explainer", category: "Finance", description: "A money concept, made simple.", sceneCount: 5, defaultDurationSec: 45, defaultStyleKey: "minimal", isPublic: true },
    { name: "Weird Animal Facts", category: "Animals", description: "Strange-but-true animal behavior.", sceneCount: 5, defaultDurationSec: 40, defaultStyleKey: "realistic_4k", isPublic: true },
  ];
  for (const t of templates) {
    const existing = await prisma.template.findFirst({ where: { name: t.name } });
    if (!existing) {
      await prisma.template.create({ data: t });
    }
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
