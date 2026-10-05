import { requireUser } from "@/server/auth/current";
import { getPreferences } from "@/server/services/notifications";
import { Panel } from "@/components/ui/misc";
import { NotificationPrefs } from "@/components/settings/notification-prefs";

export const metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  return (
    <Panel title="Notification preferences">
      <NotificationPrefs initial={await getPreferences(user.id)} />
    </Panel>
  );
}
