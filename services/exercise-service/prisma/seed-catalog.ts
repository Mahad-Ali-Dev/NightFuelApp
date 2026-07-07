/**
 * seed-catalog.ts
 *
 * Loads the self-hosted exercise catalogs (repo `exercises/<muscle>/.../
 * <muscle>_catalog.json`) into the `library_exercises` table.
 *
 * Each catalog entry carries the rich metadata the detail screen renders:
 * level, primary/secondary muscles, and step-by-step instructions. The SAME
 * exercise usually has both a Male and a Female demo; because the metadata is
 * identical and only the demo VIDEO differs, we collapse them to ONE canonical
 * LibraryExercise (so `name @unique` holds and the existing wger seed keeps
 * working) and record `gender` only when an exercise is single-gender.
 *
 * Video URLs are built from EXERCISE_VIDEO_CDN_BASE + the catalog's folder/file
 * when that env var is set; otherwise videoUrl is left null and the app falls
 * back to the image-frame / "demo coming soon" path exactly as today. The raw
 * .mp4s live outside git (gitignored) — host them on the CDN with the same
 * <muscle>/<Gender>/<Category>/<file>.mp4 layout and the URLs resolve.
 *
 * Run (after `db:migrate:deploy` + `db:generate`):
 *   npm run db:seed:catalog
 * Idempotent — upserts by name, safe to re-run.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();
const ROOT = process.env.EXERCISES_CATALOG_DIR || path.resolve(__dirname, '../../../exercises');
const CDN = (process.env.EXERCISE_VIDEO_CDN_BASE || '').replace(/\/+$/, '');

interface Entry {
  id?: string; name?: string; gender?: string; bodypart?: string; equipment?: string;
  movement?: string; level?: string; primary?: string; secondary?: string;
  description?: string; instructions?: string[]; flag?: string; folder?: string; files?: string;
  // Optional still/tutorial image a catalog may supply. Absent today (the demo
  // is the MP4), but when present it must be preserved through the upsert.
  imageUrl?: string; demoUrl?: string;
}

// Muscle-folder slug -> body-part key (must match the app's BODY_PART_LABELS /
// tipsFor keys so the Target label + coaching tips resolve) and default category.
const MUSCLE_MAP: Record<string, { bodyPart: string; category: 'gym' | 'home' | 'cardio' }> = {
  chest: { bodyPart: 'chest', category: 'gym' },
  back: { bodyPart: 'back', category: 'gym' },
  bicepes: { bodyPart: 'upper arms', category: 'gym' },
  biceps: { bodyPart: 'upper arms', category: 'gym' },
  triceps: { bodyPart: 'upper arms', category: 'gym' },
  forearms: { bodyPart: 'lower arms', category: 'gym' },
  'upper arms': { bodyPart: 'upper arms', category: 'gym' },
  shoulders: { bodyPart: 'shoulders', category: 'gym' },
  legs: { bodyPart: 'upper legs', category: 'gym' },
  calves: { bodyPart: 'lower legs', category: 'gym' },
  hips: { bodyPart: 'upper legs', category: 'gym' },
  waist: { bodyPart: 'waist', category: 'gym' },
  neck_: { bodyPart: 'neck', category: 'gym' },
  neck: { bodyPart: 'neck', category: 'gym' },
  cardio: { bodyPart: 'cardio', category: 'cardio' },
};

// Recursively collect every *_catalog.json under ROOT, tagged with the
// top-level muscle-folder slug it lives under (depth-bounded for safety).
function findCatalogs(root: string): { slug: string; file: string }[] {
  const out: { slug: string; file: string }[] = [];
  if (!fs.existsSync(root)) return out;
  for (const muscle of fs.readdirSync(root)) {
    const top = path.join(root, muscle);
    if (!fs.statSync(top).isDirectory()) continue;
    const slug = muscle.toLowerCase();
    const stack: { dir: string; depth: number }[] = [{ dir: top, depth: 0 }];
    while (stack.length) {
      const { dir, depth } = stack.pop()!;
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        if (st.isDirectory() && depth < 2) stack.push({ dir: p, depth: depth + 1 });
        else if (st.isFile() && /_catalog\.json$/i.test(f)) out.push({ slug, file: p });
      }
    }
  }
  return out;
}

function deriveCategory(slug: string, equipment?: string): 'gym' | 'home' | 'cardio' {
  if (MUSCLE_MAP[slug]?.category === 'cardio') return 'cardio';
  const eq = (equipment || '').toLowerCase();
  if (!eq || eq === 'bodyweight' || eq.includes('band') || eq.includes('suspension')) return 'home';
  return 'gym';
}

function firstFile(files?: string): string | null {
  if (!files) return null;
  const f = files.split(';')[0]?.trim();
  return f || null;
}

function videoUrlFor(slug: string, e: Entry): string | null {
  const file = firstFile(e.files);
  if (!CDN || !e.folder || !file) return null;
  // <CDN>/<slug>/<Gender>/<Category>/<file>.mp4 — encode each segment so spaces
  // and "&" in category names survive as a valid URL.
  const segs = [slug, ...e.folder.split('/'), file].map((s) => encodeURIComponent(s));
  return `${CDN}/${segs.join('/')}`;
}

async function main() {
  const catalogs = findCatalogs(ROOT);
  if (catalogs.length === 0) {
    console.log(`No *_catalog.json found under ${ROOT}. Nothing to seed.`);
    return;
  }
  console.log(`Found ${catalogs.length} catalog file(s) under ${ROOT}`);
  if (!CDN) console.log('EXERCISE_VIDEO_CDN_BASE not set — seeding metadata with videoUrl = null (app falls back to image/coming-soon).');

  let upserts = 0;
  for (const { slug, file } of catalogs) {
    let entries: Entry[];
    try {
      entries = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (err) {
      console.warn(`  ! skip unreadable ${file}: ${(err as Error).message}`);
      continue;
    }
    // Group by canonical name so Male + Female variants collapse to one row.
    const byName = new Map<string, Entry[]>();
    for (const e of entries) {
      const name = (e.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      (byName.get(key) ?? byName.set(key, []).get(key)!).push(e);
    }

    for (const group of byName.values()) {
      // Pick the canonical row. Prefer an entry that actually has a video clip
      // (`files`) so an image-only sibling (same name, no clip — the renders we
      // catalog for not-yet-filmed moves) can never collapse a real video row to
      // videoUrl=null. Within that, keep the Male-first convention.
      const hasVid = (e: Entry) => !!firstFile(e.files);
      const base =
        group.find((e) => hasVid(e) && e.gender === 'Male') ??
        group.find(hasVid) ??
        group.find((e) => e.gender === 'Male') ??
        group[0];
      const genders = new Set(group.map((e) => e.gender).filter(Boolean));
      const gender = genders.size === 1 ? ([...genders][0] as string) : null;
      // The separate Female-gendered demo clip (if the group has one), so a Female
      // user can be shown the Female video while videoUrl stays the Male/canonical.
      const femaleEntry = group.find((e) => hasVid(e) && e.gender === 'Female');
      const instructions = base.instructions?.length
        ? base.instructions.join('\n')
        : (base.description || null);
      const secondaryMuscles = (base.secondary || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
      const map = MUSCLE_MAP[slug] ?? { bodyPart: base.bodypart?.toLowerCase() || slug, category: 'gym' as const };

      const name = (base.name as string).trim();

      // Image fields the catalog can supply. Today the catalogs ship no still/
      // tutorial image (the demo is the MP4 in `videoUrl`), so these are null —
      // but if a catalog ever adds one we want to honour it.
      const imageUrl = base.imageUrl?.trim() || null;
      const demoUrl = base.demoUrl?.trim() || null;

      // Video metadata + catalog enrichment we ALWAYS (re)write. On a name
      // collision with a library-seeded row, this layers the video + metadata
      // onto the EXISTING row.
      const meta = {
        muscleGroup: base.primary || map.bodyPart,
        equipment: base.equipment || null,
        instructions,
        difficulty: (base.level || 'Intermediate'),
        bodyPart: map.bodyPart,
        category: deriveCategory(slug, base.equipment),
        secondaryMuscles,
        gender,
        videoUrl: videoUrlFor(slug, base),
        videoUrlFemale: femaleEntry ? videoUrlFor(slug, femaleEntry) : null,
      };

      // On UPDATE we deliberately OMIT imageUrl/demoUrl unless the catalog
      // actually provides one. A library row carries a real FEDB `imageUrl`;
      // overwriting it with null would destroy the row's only visual — and since
      // `videoUrl` is itself null until EXERCISE_VIDEO_CDN_BASE is set, the
      // exercise would render "demo coming soon" with no image at all. Spreading
      // the image keys only when non-null leaves any existing image untouched.
      const update = {
        ...meta,
        ...(imageUrl ? { imageUrl } : {}),
        ...(demoUrl ? { demoUrl } : {}),
      };

      // On CREATE (brand-new catalog row, no pre-existing image) writing null is
      // fine — the client falls back to the FEDB-slug image for those.
      const create = { name, ...meta, imageUrl, demoUrl };

      await prisma.libraryExercise.upsert({
        where: { name },
        update,
        create,
      });
      upserts++;
    }
    console.log(`  ✓ ${slug}: ${byName.size} unique exercises`);
  }
  console.log(`\nDone — upserted ${upserts} library exercises from catalogs.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
