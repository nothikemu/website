"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { api } from "@/lib/api-client";
import { ROLE_LABEL } from "@/lib/status";

type Member = { id: string; username: string; displayName: string; avatarUrl: string | null; email: string | null; role: string; joinedAt: string | Date };

export function MembersTable({ org, members, me, myRole }: { org: string; members: Member[]; me: string; myRole: string }) {
  const router = useRouter();
  const canManage = myRole === "owner" || myRole === "admin";
  async function setRole(id: string, role: string) {
    try {
      await api("PATCH", `/api/v1/orgs/${org}/members/${id}`, { role });
      toast.success("Role updated");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function remove(id: string, self: boolean) {
    if (!confirm(self ? "Leave this organization?" : "Remove this member? They lose access to every project immediately.")) return;
    try {
      await api("DELETE", `/api/v1/orgs/${org}/members/${id}`);
      toast.success(self ? "You left the organization" : "Member removed");
      if (self) router.push("/organizations");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <ul className="divide-y divide-border">
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
          <Avatar user={m} size={28} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              {m.displayName}
              {m.id === me ? <Badge>You</Badge> : null}
            </div>
            <div className="truncate font-mono text-2xs text-fg-subtle">
              @{m.username}
              {m.email ? ` · ${m.email}` : ""}
            </div>
          </div>
          {canManage && m.id !== me ? (
            <Select value={m.role} onChange={(e) => setRole(m.id, e.target.value)} className="w-32">
              {(myRole === "owner" ? ["owner", "admin", "engineer", "viewer"] : ["admin", "engineer", "viewer"]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
              {myRole !== "owner" && m.role === "owner" ? <option value="owner">Owner</option> : null}
            </Select>
          ) : (
            <span className="w-32 text-right text-sm text-fg-muted">{ROLE_LABEL[m.role]}</span>
          )}
          {canManage || m.id === me ? (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Member actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem danger onSelect={() => remove(m.id, m.id === me)}>
                  {m.id === me ? "Leave organization" : "Remove from organization"}
                </MenuItem>
              </MenuContent>
            </Menu>
          ) : (
            <span className="w-6" />
          )}
        </li>
      ))}
    </ul>
  );
}

export function InviteDialog({ org, defaultOpen }: { org: string; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState("engineer");
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <UserPlus className="size-3.5" /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent title="Invite teammates" description="They'll get an email with a link that expires in 7 days.">
        <div className="grid gap-4">
          <Field label="Email addresses" hint="Separate with commas or new lines">
            <Textarea rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="viraj@team.org, nikhilesh@team.org" className="font-mono text-xs" autoFocus />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">Admin — manage members, settings and all projects</option>
              <option value="engineer">Engineer — create and edit project content</option>
              <option value="viewer">Viewer — read and comment</option>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button
            variant="primary"
            loading={loading}
            onClick={async () => {
              const list = emails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
              if (!list.length) return;
              setLoading(true);
              try {
                const res = await api<{ email: string; status: string }[]>("POST", `/api/v1/orgs/${org}/invitations`, { emails: list, role });
                const invited = res.filter((r) => r.status === "invited").length;
                toast.success(`${invited} invitation${invited === 1 ? "" : "s"} sent${res.length > invited ? ` · ${res.length - invited} already members` : ""}`);
                setEmails("");
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setLoading(false);
              }
            }}
          >
            Send invitations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
