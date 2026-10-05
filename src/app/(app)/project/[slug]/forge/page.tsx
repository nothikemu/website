import Link from "next/link";
import { Bot } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { getProjectShell } from "@/server/services/shell";
import { projectForPage } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { ForgeChat } from "@/components/project/forge-chat";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Forge" };

export default async function ForgePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const shell = await getProjectShell(user, slug);
  const forge = shell!.forge;
  return (
    <>
      <ProjectHeader project={access.project} org={access.org} crumbs={[{ label: "Forge" }]} />
      <Content className="max-w-3xl">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-accent">
            <Bot className="size-5" />
          </span>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.015em]">
              Forge
              {forge.enabled ? <Badge tone="green">{forge.provider}</Badge> : <Badge>retrieval mode</Badge>}
            </h1>
            <p className="text-sm text-fg-muted">
              Answers only from this project&apos;s records — requirements, tests, decisions, changes, notebook and files — and cites them. {forge.enabled ? "" : "No AI provider is configured, so Forge shows the records it retrieved instead of a written answer."}
            </p>
          </div>
        </div>
        {forge.planAllows ? (
          <ForgeChat project={access.project.slug} />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm font-medium">Forge is available on the Pro plan</p>
            <p className="mt-1 text-sm text-fg-muted">Your organization is on the {access.org.plan} plan.</p>
            <Link href={`/org/${access.org.slug}/billing`} className={buttonClass("secondary", "sm", "mt-4")}>
              View plans
            </Link>
          </div>
        )}
      </Content>
    </>
  );
}
