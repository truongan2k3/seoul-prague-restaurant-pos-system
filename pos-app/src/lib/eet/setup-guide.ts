import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const files = [
  { id: "preflight", title: "1. Inspect the current database (read-only)", path: "supabase/eet-preflight-readonly.sql" },
  { id: "schema", title: "2. Install EET tables and queue", path: "supabase/migrations/202611100001_eet_integration.sql" },
  { id: "materials", title: "3. Install encrypted certificate storage", path: "supabase/migrations/202611100002_eet_setup_materials.sql" },
] as const;

/** Fixed repository paths only; never reads environment files, stored material, or user paths. */
export async function getEetSetupScripts() {
  return Promise.all(files.map(async file => ({ id: file.id, title: file.title, path: file.path,
    code: await readFile(join(process.cwd(), file.path), "utf8").catch(() => "") })));
}
