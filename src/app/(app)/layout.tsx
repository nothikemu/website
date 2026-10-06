import { requireUser } from "@/server/auth/current";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
