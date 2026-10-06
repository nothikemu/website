import { Content, PageHeader } from "@/components/app/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader crumbs={[{ label: "Settings" }]} />
      <Content>
        <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <SettingsNav />
          <div className="min-w-0">{children}</div>
        </div>
      </Content>
    </>
  );
}
