import Link from "next/link";
import { requireUser } from "@/server/auth/current";
import { projectActivity } from "@/server/services/activity";
import { load, projectForPage } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { ActivityList } from "@/components/app/activity-feed";
import { EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Activity" };

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ cursor?: string }> }) {
  const { slug } = await params;
  const { cursor } = await searchParams;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const feed = await load(projectActivity(user, slug, { cursor, limit: 60 }));
  const base = `/project/${access.project.slug}`;
  return (
    <>
      <ProjectHeader project={access.project} org={access.org} crumbs={[{ label: "Activity" }]} />
      <Content className="max-w-4xl">
        <PageTitle title="Activity" description="The complete engineering history of the project, newest first." />
        <div className="mt-5">{feed.items.length ? <ActivityList items={feed.items} grouped /> : <EmptyState title="No activity yet" />}</div>
        <div className="mt-5 flex justify-center gap-2">
          {cursor ? (
            <Link href={`${base}/activity`} className={buttonClass("ghost", "sm")}>
              Newest
            </Link>
          ) : null}
          {feed.nextCursor ? (
            <Link href={`${base}/activity?cursor=${encodeURIComponent(feed.nextCursor)}`} className={buttonClass("secondary", "sm")}>
              Older activity
            </Link>
          ) : null}
        </div>
      </Content>
    </>
  );
}
