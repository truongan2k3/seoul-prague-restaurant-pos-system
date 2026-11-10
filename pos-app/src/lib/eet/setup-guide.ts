import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const files = [
  { id: "preflight", title: "1. Inspect the current database (read-only)", path: "supabase/eet-preflight-readonly.sql" },
  { id: "schema", title: "2. Install EET tables and queue", path: "supabase/migrations/202611100001_eet_integration.sql" },
  { id: "materials", title: "3. Install encrypted certificate storage", path: "supabase/migrations/202611100002_eet_setup_materials.sql" },
  { id: "manager", title: "4. Install manager-code rate limiting (additive, rerunnable)", path: "supabase/migrations/202611100003_eet_manager_access.sql" },
] as const;

// Literal paths keep Next.js tracing limited to these four reviewed SQL files.
const readScript = {
  preflight: () => readFile(join(process.cwd(), "supabase/eet-preflight-readonly.sql"), "utf8"),
  schema: () => readFile(join(process.cwd(), "supabase/migrations/202611100001_eet_integration.sql"), "utf8"),
  materials: () => readFile(join(process.cwd(), "supabase/migrations/202611100002_eet_setup_materials.sql"), "utf8"),
  manager: () => readFile(join(process.cwd(), "supabase/migrations/202611100003_eet_manager_access.sql"), "utf8"),
};

/** Fixed repository paths only; never reads environment files, stored material, or user paths. */
export async function getEetSetupScripts() {
  return Promise.all(files.map(async file => ({ id: file.id, title: file.title, path: file.path,
    code: await readScript[file.id]().catch(() => "") })));
}
