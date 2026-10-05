import { requireUser } from "@/server/auth/current";
import { projectForPage } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { SettingsTabs } from "@/components/project/settings-tabs";

export default async function ProjectSettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const base = `/project/${access.project.slug}`;
  return (
    <>
      <ProjectHeader project={access.project} org={access.org} crumbs={[{ label: "Settings" }]} />
      <Content className="max-w-4xl">
        <PageTitle title="Project settings" description={access.role === "admin" ? undefined : "You can view settings; only project admins can change them."} />
        <div className="mt-5">
          <SettingsTabs base={base} />
          {children}
        </div>
      </Content>
    </>
  );
}
