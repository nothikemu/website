import { route } from "@/server/http/api";
import { listGithubRepos } from "@/server/services/integrations";

export const GET = route({ auth: "required" }, async ({ user }) => listGithubRepos(user));
