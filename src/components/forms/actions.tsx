"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { IssueStatusIcon, PriorityIcon, TaskStatusIcon } from "@/components/app/status";

type Display = "text" | "issueStatus" | "taskStatus" | "priority" | "person";

function DisplayValue({ display, value, options, people }: { display: Display; value: string | null; options: { value: string; label: string }[]; people?: { id: string; displayName: string; username: string; avatarUrl: string | null }[] }) {
  const label = options.find((o) => o.value === value)?.label;
  switch (display) {
    case "issueStatus":
      return <><IssueStatusIcon status={value ?? "open"} /> {label}</>;
    case "taskStatus":
      return <><TaskStatusIcon status={value ?? "todo"} /> {label}</>;
    case "priority":
      return <><PriorityIcon priority={value ?? "none"} /> {label}</>;
    case "person": {
      const p = people?.find((x) => x.id === value);
      return <><Avatar user={p} size={18} /> {p ? <span className="truncate">{p.displayName}</span> : <span className="text-fg-subtle">Unassigned</span>}</>;
    }
    default:
      return label ? <span className="truncate">{label}</span> : <span className="text-fg-subtle">None</span>;
  }
}

/** Button that performs an API call, then refreshes or navigates. */
export function ActionButton({
  method = "POST",
  url,
  body,
  confirm,
  successMessage,
  redirectTo,
  children,
  ...props
}: Omit<ButtonProps, "onClick"> & { method?: "POST" | "PATCH" | "DELETE" | "PUT"; url: string; body?: unknown; confirm?: string; successMessage?: string; redirectTo?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      {...props}
      loading={loading}
      onClick={async () => {
        if (confirm && !window.confirm(confirm)) return;
        setLoading(true);
        try {
          await api(method, url, body);
          if (successMessage) toast.success(successMessage);
          if (redirectTo) router.push(redirectTo);
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      {children}
    </Button>
  );
}

/** Inline property editor (status, priority, assignee…) that PATCHes one field optimistically. */
export function PropertySelect({
  url,
  field,
  value,
  options,
  disabled,
  display = "text",
  people,
  className,
  nullable,
}: {
  url: string;
  field: string;
  value: string | null;
  options: { value: string; label: string }[];
  disabled?: boolean;
  display?: Display;
  people?: { id: string; displayName: string; username: string; avatarUrl: string | null }[];
  className?: string;
  nullable?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  return (
    <label className={cn("relative flex h-7 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-surface-2", disabled && "pointer-events-none", className)}>
      <DisplayValue display={display} value={current} options={options} people={people} />
      <select
        disabled={disabled}
        aria-label={field}
        value={current ?? ""}
        onChange={async (e) => {
          const prev = current;
          const next = e.target.value === "" ? null : e.target.value;
          setCurrent(next);
          try {
            await api("PATCH", url, { [field]: next });
            router.refresh();
          } catch (err) {
            setCurrent(prev);
            toast.error((err as Error).message);
          }
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {nullable ? <option value="">None</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Destructive action guarded by typing a confirmation word. */
export function DangerConfirm({ title, description, confirmWord, url, method = "DELETE", body, redirectTo, label }: { title: string; description: ReactNode; confirmWord: string; url: string; method?: "DELETE" | "POST"; body?: (typed: string) => unknown; redirectTo: string; label: string }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="danger" size="sm">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <p className="mb-2 text-sm text-fg-muted">
          Type <span className="font-mono text-fg">{confirmWord}</span> to confirm.
        </p>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="font-mono" autoFocus />
        <DialogFooter>
          <Button
            variant="danger"
            disabled={typed !== confirmWord}
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await api(method, url, body ? body(typed) : { confirm: typed });
                toast.success("Deleted");
                router.push(redirectTo);
                router.refresh();
              } catch (e) {
                toast.error((e as Error).message);
                setLoading(false);
              }
            }}
          >
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
