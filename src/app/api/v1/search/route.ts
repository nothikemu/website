import { route } from "@/server/http/api";
import { searchQuerySchema } from "@/lib/validation";
import { search } from "@/server/search";
import { getProjectAccess } from "@/server/authz";
import { NotFound } from "@/server/http/errors";
import type { EntityType } from "@/server/events/types";

const TYPES = new Set(["project", "file", "issue", "task", "requirement", "test", "decision", "change", "notebook_entry", "release", "snapshot", "commit", "user"]);

export const GET = route({ auth: "required" }, async (ctx) => {
  const q = ctx.query(searchQuerySchema);
  let projectId: string | undefined;
  if (q.project) {
    const access = await getProjectAccess(ctx.user, q.project);
    if (!access) throw NotFound("Project");
    projectId = access.project.id;
  }
  const types = q.type?.split(",").filter((t) => TYPES.has(t)) as EntityType[] | undefined;
  return search(ctx.user.id, q.q, { projectId, types: types?.length ? types : undefined, limit: q.limit });
});
