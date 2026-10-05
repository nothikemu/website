import Link from "next/link";
import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Time } from "@/components/app/time";

/** Title block for engineering records: REF, title, author line, edit toggle. */
export function RecordTitle({ refLabel, title, badges, author, createdAt, editHref, extra }: { refLabel: string; title: ReactNode; badges?: ReactNode; author?: { displayName: string; username: string; avatarUrl: string | null } | null; createdAt: Date; editHref?: string | null; extra?: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-fg-subtle">{refLabel}</span>
            {badges}
          </div>
          <h1 className="text-xl leading-snug font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        </div>
        {editHref ? (
          <Link href={editHref} className={buttonClass("ghost", "sm")}>
            <Pencil className="size-3.5" /> Edit
          </Link>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
        {author ? (
          <span className="flex items-center gap-1.5">
            <Avatar user={author} size={16} />
            <span className="text-fg-muted">{author.displayName}</span>
          </span>
        ) : null}
        <span>
          created <Time date={createdAt} />
        </span>
        {extra}
      </div>
    </div>
  );
}
