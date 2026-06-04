import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { backfillNpcStatBlocks, BackfillPrisma } from './npc-statblock-backfill';

// One-off (idempotent) backfill for VEG-261: re-derive existing NPC stat-block snapshots
// from the corrected monsters table. Run: npm run backfill:npc-statblocks
async function main() {
  const app = await NestFactory.createApplicationContext(PrismaModule);
  // Prisma's generated delegate types are structurally wider than the slice the backfill
  // needs; cast at this boundary so the helper can keep a small, mockable interface.
  const prisma = app.get(PrismaService) as unknown as BackfillPrisma;
  const { scanned, updated, skipped } = await backfillNpcStatBlocks(prisma);
  console.log(
    `NPC stat-block backfill: scanned ${scanned}, updated ${updated}, skipped ${skipped.length}`
  );
  for (const s of skipped) console.log(`  skipped ${s.id}: ${s.reason}`);
  await app.close();
}

void main();
