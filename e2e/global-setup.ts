import { execSync } from 'node:child_process';
import path from 'node:path';

// Tables holding user-generated runtime data. Truncated before every test run
// so each Playwright invocation starts from the same clean slate. SRD and
// reference tables (spells, monsters, races, npc_name_pools, etc.) are
// intentionally omitted — they are populated by the seed and reused.
//
// When adding a new top-level entity model in prisma/schema.prisma whose
// rows are created at runtime by users (not the seed), add the table here.
//
// `users` is deliberately NOT in this list: the VEG-292 content tables
// (monsters/spells/items/feats) now carry a createdById FK to users with
// ON DELETE CASCADE, and `TRUNCATE users CASCADE` truncates *every* table that
// references it — which would structurally wipe the seeded SRD catalog. It is
// cleared with DELETE below instead (see the sql), which honors the per-row
// cascade: only homebrew owned by the deleted users is removed, leaving SRD
// rows (createdById IS NULL) intact.
const APP_DATA_TABLES = [
  'audit_logs',
  'npc_relations',
  'npcs',
  'npc_custom_personality',
  'encounters',
  'notes',
  'characters',
  'campaign_players',
  'campaigns',
];

const E2E_DB_NAME = process.env.E2E_DB_NAME ?? 'grimoire_os_e2e';

export default async function globalSetup(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..');
  const tables = APP_DATA_TABLES.join(', ');
  // Truncate the app tables that reference users first (clears the children),
  // then DELETE users so its per-row ON DELETE CASCADE spares the SRD catalog.
  // Homebrew content rows must go before users: their createdById FK is
  // ON DELETE SET NULL, and the homebrew-has-creator CHECK constraint rejects
  // the nulled row (the app deletes homebrew in UsersService.remove for the
  // same reason, VEG-317/VEG-293).
  // The identifier quotes are backslash-escaped because the whole statement is
  // interpolated into a double-quoted `psql -c "..."` shell argument below.
  const homebrewCleanup = ['monsters', 'spells', 'items', 'feats']
    .map(t => `DELETE FROM ${t} WHERE \\"contentSource\\" = 'homebrew';`)
    .join(' ');
  const sql = `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE; ${homebrewCleanup} DELETE FROM users;`;

  // Run inside the postgres container — same path the dev scripts use, so we
  // do not need a host-side psql client or a new node dependency.
  const cmd = [
    'docker compose',
    '-f',
    `"${path.join(repoRoot, 'docker-compose.yml')}"`,
    'exec -T postgres',
    'psql',
    '-U grimoire',
    `-d ${E2E_DB_NAME}`,
    '-v ON_ERROR_STOP=1',
    `-c "${sql}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? '';
    const stdout = (err as { stdout?: Buffer }).stdout?.toString() ?? '';
    throw new Error(
      `E2E global-setup failed to truncate ${E2E_DB_NAME}. ` +
        `Make sure dev-e2e.sh has run at least once so the database and schema exist.\n` +
        `stderr: ${stderr}\nstdout: ${stdout}`
    );
  }
}
