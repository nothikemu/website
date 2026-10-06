import { requireUser } from "@/server/auth/current";
import { listDeletedFiles } from "@/server/services/files";
import { load, projectForPage } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { Panel, EmptyState } from "@/components/ui/misc";
import { FileIcon } from "@/components/files/file-icon";
import { ActionButton } from "@/components/forms/actions";
import { Time } from "@/components/app/time";

export const metadata = { title: "Trash" };

export default async function TrashPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const rows = await load(listDeletedFiles(user, slug));
  const base = `/project/${access.project.slug}`;
  return (
    <>
      <ProjectHeader project={access.project} org={access.org} crumbs={[{ label: "Files", href: `${base}/files` }, { label: "Trash" }]} />
      <Content>
        <Panel title="Deleted files" count={rows.length}>
          {rows.length ? (
            <ul className="divide-y divide-border">
              {rows.map(({ file, user: u }) => (
                <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                  <FileIcon kind={file.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">{file.path}</span>
                    <span className="text-2xs text-fg-subtle">
                      v{file.versionCount} · deleted <Time date={file.deletedAt!} /> {u?.displayName ? `by ${u.displayName}` : ""}
                    </span>
                  </span>
                  {access.role !== "viewer" ? (
                    <ActionButton size="xs" url={`/api/v1/projects/${access.project.slug}/files/${file.id}/undelete`} successMessage="Restored">
                      Restore
                    </ActionButton>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Trash is empty" description="Deleted files keep their full revision history and can be restored here or from any project version." />
          )}
        </Panel>
      </Content>
    </>
  );
}
