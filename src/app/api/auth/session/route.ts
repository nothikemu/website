import { route, publicUser } from "@/server/http/api";

export const GET = route({ auth: "optional", rateLimit: false }, async ({ user }) => ({ user: user ? publicUser(user) : null }));
