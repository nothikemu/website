import Link from "next/link";
import { Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { folderTree, listDirectory } from "@/server/services/files";
import { load } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { FileBrowser } from "@/components/files/file-browser";
import { buttonClass } from "@/components/ui/button";
import { History } from "lucide-react";

export const metadata = { title: "Files" };

export default async function FilesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ folder?: string; upload?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const folderId = sp.folder && /^[0-9a-f-]{36}$/i.test(sp.folder) ? sp.folder : null;
  const [dir, tree] = await Promise.all([load(listDirectory(user, slug, folderId)), load(folderTree(user, slug))]);
  const { project, org, role } = dir.access;
  const base = `/project/${project.slug}`;
  return (
    <>
      <ProjectHeader
        project={project}
        org={org}
        crumbs={[{ label: "Files", href: `${base}/files` }, ...dir.breadcrumbs.map((b, i) => ({ label: b.name, href: i < dir.breadcrumbs.length - 1 ? `${base}/files?folder=${b.id}` : undefined }))]}
        actions={
          <>
            <Link href={`${base}/versions`} className={buttonClass("ghost", "sm")}>
              <History className="size-3.5" /> Versions
            </Link>
            <Link href={`${base}/files/trash`} className={buttonClass("ghost", "sm")}>
              <Trash2 className="size-3.5" /> Trash
            </Link>
          </>
        }
      />
      <Content wide>
        <div className="mb-3 flex items-center gap-1 font-mono text-sm">
          <Link href={`${base}/files`} className="text-fg-muted hover:text-fg">
            {project.slug}
          </Link>
          {dir.breadcrumbs.map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <span className="text-fg-subtle">/</span>
              <Link href={`${base}/files?folder=${b.id}`} className="text-fg-muted hover:text-fg">
                {b.name}
              </Link>
            </span>
          ))}
          <span className="text-fg-subtle">/</span>
        </div>
        <FileBrowser
          project={project.slug}
          folderId={folderId}
          folders={dir.folders}
          files={dir.files}
          tree={tree}
          canWrite={role !== "viewer"}
          autoUpload={sp.upload === "1"}
        />
        <p className="mt-3 text-xs text-fg-subtle">
          Files upload directly to object storage through short-lived signed URLs. Every upload is checked for type and size, versioned, and indexed for search.
        </p>
      </Content>
    </>
  );
}
