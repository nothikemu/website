import { route } from "@/server/http/api";
import { listMembers } from "@/server/services/organizations";

export const GET = route<{ org: string }>({ auth: "required" }, async ({ user, params }) => listMembers(user, params.org));
