import { Content, PageHeader, PageTitle } from "@/components/app/page-header";
import { NewOrgForm } from "@/components/org/new-org-form";

export const metadata = { title: "New organization" };

export default async function NewOrgPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  return (
    <>
      <PageHeader crumbs={[{ label: "Organizations", href: "/organizations" }, { label: "New" }]} />
      <Content className="max-w-xl">
        <PageTitle
          title={welcome ? "Welcome to Forgebase" : "New organization"}
          description={welcome ? "Start by creating an organization for your team. You'll be its owner and can invite teammates next." : "Organizations hold projects, members and settings. You'll be the owner."}
        />
        <div className="mt-6 rounded-lg border border-border bg-surface p-5">
          <NewOrgForm />
        </div>
      </Content>
    </>
  );
}
