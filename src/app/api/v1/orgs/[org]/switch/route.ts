import { route } from "@/server/http/api";
import { setActiveOrganization } from "@/server/services/organizations";

export const POST = route<{ org: string }>({ auth: "required" }, async ({ user, params }) => {
  const org = await setActiveOrganization(user, params.org);
  return { slug: org.slug };
});
