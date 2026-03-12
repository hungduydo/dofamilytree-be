/**
 * Migration script: Migrate data from old `relationships` table to new `member_relationships` table.
 *
 * Mapping:
 *   PARENT (from=A, to=B) → { parent_id: A, child_id: B, type: BIOLOGICAL }
 *   CHILD  (from=A, to=B) → { parent_id: B, child_id: A, type: BIOLOGICAL }
 *   SPOUSE (from=A, to=B) → { parent_id: A, child_id: B, type: SPOUSE }
 *
 * Uses upsert to be idempotent (safe to run multiple times).
 *
 * Usage:
 *   cd backend-v2 && pnpm exec ts-node scripts/migrate-relationships.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting relationship migration...');

  const oldRelationships = await (prisma as any).relationship.findMany();
  console.log(`Found ${oldRelationships.length} relationships to migrate.`);

  let migrated = 0;
  let skipped = 0;

  for (const rel of oldRelationships) {
    try {
      let parentId: string;
      let childId: string;
      let type: 'BIOLOGICAL' | 'ADOPTED' | 'SPOUSE';

      switch (rel.type) {
        case 'PARENT':
          parentId = rel.from_member_id;
          childId = rel.to_member_id;
          type = 'BIOLOGICAL';
          break;
        case 'CHILD':
          parentId = rel.to_member_id;
          childId = rel.from_member_id;
          type = 'BIOLOGICAL';
          break;
        case 'SPOUSE':
          parentId = rel.from_member_id;
          childId = rel.to_member_id;
          type = 'SPOUSE';
          break;
        default:
          console.warn(`Unknown type: ${rel.type} — skipping`);
          skipped++;
          continue;
      }

      // Skip if would create duplicate parent for BIOLOGICAL/ADOPTED
      if (type === 'BIOLOGICAL') {
        const existing = await (prisma as any).memberRelationship.findFirst({
          where: {
            child_id: childId,
            type: { in: ['BIOLOGICAL', 'ADOPTED'] },
          },
        });
        if (existing && existing.parent_id !== parentId) {
          console.warn(`Skipping PARENT duplicate for child ${childId}`);
          skipped++;
          continue;
        }
      }

      await (prisma as any).memberRelationship.upsert({
        where: {
          // Composite uniqueness: we use a custom check since there's no unique constraint
          // Use id from old relationship as a stable key via note field
          id: rel.id, // reuse old UUID if possible
        },
        update: {},
        create: {
          id: rel.id, // preserve original UUID for idempotency
          parent_id: parentId,
          child_id: childId,
          type,
          note: `Migrated from old relationship (type: ${rel.type})`,
          created_at: rel.created_at,
        },
      });

      migrated++;
    } catch (error: any) {
      console.error(`Failed to migrate relationship ${rel.id}: ${error.message}`);
      skipped++;
    }
  }

  console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
