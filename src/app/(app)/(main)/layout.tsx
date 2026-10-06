import { requireUser } from "@/server/auth/current";
import { getShellData } from "@/server/services/shell";
import { ShellFrame } from "@/components/app/shell-frame";
import { Sidebar } from "@/components/app/sidebar";
import { VerifyBanner } from "@/components/app/verify-banner";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const shell = await getShellData(user);
  return (
    <ShellFrame
      projects={shell.projects}
      orgs={shell.orgs}
      activeOrg={shell.activeOrg}
      sidebar={<Sidebar user={user} orgs={shell.orgs} activeOrg={shell.activeOrg} projects={shell.orgProjects} unread={shell.unread} />}
    >
      {!user.emailVerifiedAt && !user.isDemo ? <VerifyBanner email={user.email} /> : null}
      {children}
    </ShellFrame>
  );
}
