import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current";
import { getProjectShell, getShellData } from "@/server/services/shell";
import { ShellFrame } from "@/components/app/shell-frame";
import { Sidebar } from "@/components/app/sidebar";
import { UploadProvider } from "@/components/files/upload-manager";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const [shell, project] = await Promise.all([getShellData(user), getProjectShell(user, slug)]);
  if (!project) notFound();
  const activeOrg = shell.orgs.find((o) => o.id === project.org.id) ?? shell.activeOrg;
  return (
    <ShellFrame
      projects={shell.projects}
      orgs={shell.orgs}
      activeOrg={activeOrg}
      sidebar={
        <Sidebar
          user={user}
          orgs={shell.orgs}
          activeOrg={activeOrg}
          projects={shell.orgProjects}
          unread={shell.unread}
          project={{ slug: project.project.slug, name: project.project.name, type: project.project.type, role: project.role, counts: project.counts, forge: project.forge.enabled }}
        />
      }
    >
      <UploadProvider project={project.project.slug}>{children}</UploadProvider>
    </ShellFrame>
  );
}
