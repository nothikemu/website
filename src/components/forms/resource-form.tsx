"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { MarkdownEditor } from "./markdown-editor";

export type Option = { value: string; label: string };
export type Person = { id: string; displayName: string; username: string };

export type FieldDef =
  | { name: string; label: string; type: "text"; placeholder?: string; required?: boolean; mono?: boolean; hint?: string; span?: 1 | 2; inputType?: string }
  | { name: string; label: string; type: "markdown"; placeholder?: string; rows?: number; hint?: string; span?: 1 | 2 }
  | { name: string; label: string; type: "select"; options: Option[]; hint?: string; span?: 1 | 2 }
  | { name: string; label: string; type: "person"; people: Person[]; allowNone?: boolean; hint?: string; span?: 1 | 2 }
  | { name: string; label: string; type: "date"; hint?: string; span?: 1 | 2 }
  | { name: string; label: string; type: "tags"; placeholder?: string; hint?: string; span?: 1 | 2 }
  | { name: string; label: string; type: "refs"; prefix: string; placeholder?: string; hint?: string; span?: 1 | 2 }
  | { name: string; label: string; type: "checkbox"; hint?: string; span?: 1 | 2 }
  | { name: string; label: string; type: "alternatives"; hint?: string; span?: 1 | 2 }
  | { name: string; label: string; type: "changeItems"; hint?: string; span?: 1 | 2 }
  | { name: string; label: string; type: "measurements"; hint?: string; span?: 1 | 2 };

type Values = Record<string, unknown>;

/** Convert form state to an API payload (empty → null, refs "REQ-001, 4" → [1, 4]). */
function toPayload(fields: FieldDef[], v: Values) {
  const out: Values = {};
  for (const f of fields) {
    const raw = v[f.name];
    if (f.name.includes(".")) continue;
    switch (f.type) {
      case "tags":
        out[f.name] = String(raw ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "refs":
        out[f.name] = String(raw ?? "")
          .split(/[,\s]+/)
          .map((s) => Number(s.replace(/^[A-Z]+-/i, "")))
          .filter((n) => Number.isInteger(n) && n > 0);
        break;
      case "person":
      case "date":
      case "select":
        out[f.name] = raw === "" || raw === undefined ? null : raw;
        break;
      case "checkbox":
        out[f.name] = Boolean(raw);
        break;
      case "alternatives":
      case "changeItems":
      case "measurements":
        out[f.name] = raw ?? [];
        break;
      default:
        out[f.name] = typeof raw === "string" ? (raw.trim() === "" ? null : raw) : raw;
    }
  }
  // Nested "links.requirements" style fields.
  for (const f of fields.filter((x) => x.name.includes("."))) {
    const [a, b] = f.name.split(".") as [string, string];
    const nums = String(v[f.name] ?? "")
      .split(/[,\s]+/)
      .map((s) => Number(s.replace(/^[A-Z]+-/i, "")))
      .filter((n) => Number.isInteger(n) && n > 0);
    out[a] = { ...((out[a] as object) ?? {}), [b]: nums };
  }
  return out;
}

export function ResourceForm({
  fields,
  initial = {},
  method,
  action,
  submitLabel,
  redirectTo,
  onSuccessHref,
  cancelHref,
  extra,
  transform,
  layout = "stack",
}: {
  fields: FieldDef[];
  initial?: Values;
  method: "POST" | "PATCH";
  action: string;
  submitLabel: string;
  /** Static redirect after success. */
  redirectTo?: string;
  /** Build a redirect from the API response, e.g. (r) => `/project/x/issues/${r.number}`. */
  onSuccessHref?: string;
  cancelHref?: string;
  extra?: ReactNode;
  transform?: (payload: Values) => Values;
  layout?: "stack" | "grid";
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (name: string, v: unknown) => setValues((s) => ({ ...s, [name]: v }));

  async function submit() {
    setLoading(true);
    setError(null);
    setErrors({});
    try {
      let payload = toPayload(fields, values);
      if (transform) payload = transform(payload);
      const res = await api<Record<string, unknown>>(method, action, payload);
      toast.success(method === "POST" ? "Created" : "Saved");
      const href = onSuccessHref ? onSuccessHref.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(res?.[k] ?? ""))) : redirectTo;
      if (href) router.push(href);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.issues?.length) {
        setErrors(Object.fromEntries(e.issues.map((i) => [i.path.split(".")[0]!, i.message])));
        setError("Please fix the highlighted fields.");
      } else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      <div className={cn("grid gap-4", layout === "grid" && "sm:grid-cols-2")}>
        {fields.map((f, idx) => (
          <Field key={f.name} label={f.type === "checkbox" ? undefined : f.label} htmlFor={f.name} hint={f.hint} error={errors[f.name.split(".")[0]!]} className={cn(layout === "grid" && (f.span === 2 || ["markdown", "alternatives", "changeItems", "measurements"].includes(f.type)) && "sm:col-span-2")}>
            {renderField(f, values[f.name], (v) => set(f.name, v), idx === 0, submit)}
          </Field>
        ))}
      </div>
      {extra}
      {error ? <p className="rounded-md border border-red/30 bg-red-soft px-3 py-2 text-xs text-red">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" loading={loading}>
          {submitLabel}
        </Button>
        {cancelHref ? (
          <Button type="button" variant="ghost" onClick={() => router.push(cancelHref)}>
            Cancel
          </Button>
        ) : null}
        <span className="ml-auto hidden text-2xs text-fg-subtle sm:block">⌘ ↵ to submit from a text area</span>
      </div>
    </form>
  );
}

function renderField(f: FieldDef, value: unknown, onChange: (v: unknown) => void, first: boolean, submit: () => void) {
  switch (f.type) {
    case "text":
      return <Input id={f.name} type={f.inputType ?? "text"} autoFocus={first} required={f.required} placeholder={f.placeholder} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={f.mono ? "font-mono" : undefined} />;
    case "markdown":
      return <MarkdownEditor id={f.name} value={String(value ?? "")} onChange={onChange} placeholder={f.placeholder} rows={f.rows} onSubmitShortcut={submit} />;
    case "select":
      return (
        <Select id={f.name} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case "person":
      return (
        <Select id={f.name} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {f.allowNone !== false ? <option value="">Unassigned</option> : null}
          {f.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName} (@{p.username})
            </option>
          ))}
        </Select>
      );
    case "date":
      return <Input id={f.name} type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className="font-mono" />;
    case "tags":
      return <Input id={f.name} placeholder={f.placeholder ?? "comma, separated"} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "refs":
      return <Input id={f.name} placeholder={f.placeholder ?? `${f.prefix}-001, ${f.prefix}-004`} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className="font-mono" />;
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          {f.label}
        </label>
      );
    case "alternatives":
      return <ListEditor value={(value as Row[]) ?? []} onChange={onChange} columns={[{ key: "name", label: "Option", width: "flex-[2]" }, { key: "pros", label: "Pros" }, { key: "cons", label: "Cons" }]} checkbox="chosen" addLabel="Add alternative" />;
    case "changeItems":
      return <ListEditor value={(value as Row[]) ?? []} onChange={onChange} columns={[{ key: "parameter", label: "Parameter" }, { key: "from", label: "From", mono: true }, { key: "to", label: "To", mono: true }]} addLabel="Add change" />;
    case "measurements":
      return (
        <ListEditor
          value={(value as Row[]) ?? []}
          onChange={onChange}
          columns={[{ key: "name", label: "Measurement", width: "flex-[2]" }, { key: "value", label: "Value", mono: true, number: true }, { key: "unit", label: "Unit", mono: true }, { key: "min", label: "Min", mono: true, number: true }, { key: "max", label: "Max", mono: true, number: true }]}
          addLabel="Add measurement"
        />
      );
  }
}

type Row = Record<string, string | number | boolean | null>;

function ListEditor({ value, onChange, columns, addLabel, checkbox }: { value: Row[]; onChange: (v: unknown) => void; columns: { key: string; label: string; mono?: boolean; number?: boolean; width?: string }[]; addLabel: string; checkbox?: string }) {
  const update = (i: number, k: string, v: string | boolean, number?: boolean) => {
    const next = value.map((r, j) => (j === i ? { ...r, [k]: number ? (v === "" ? null : Number(v)) : v } : r));
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {value.length ? (
        <div className="hidden gap-1.5 px-0.5 text-2xs text-fg-subtle sm:flex">
          {checkbox ? <span className="w-12">Chosen</span> : null}
          {columns.map((c) => (
            <span key={c.key} className={c.width ?? "flex-1"}>
              {c.label}
            </span>
          ))}
          <span className="w-7" />
        </div>
      ) : null}
      {value.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
          {checkbox ? (
            <span className="flex w-12 justify-center">
              <input type="checkbox" checked={Boolean(row[checkbox])} onChange={(e) => update(i, checkbox, e.target.checked)} className="size-4 accent-[var(--accent)]" />
            </span>
          ) : null}
          {columns.map((c) => (
            <Input key={c.key} placeholder={c.label} value={row[c.key] === null || row[c.key] === undefined ? "" : String(row[c.key])} onChange={(e) => update(i, c.key, e.target.value, c.number)} type={c.number ? "number" : "text"} step="any" className={cn(c.width ?? "flex-1", "min-w-0", c.mono && "font-mono")} />
          ))}
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove row">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, Object.fromEntries(columns.map((c) => [c.key, c.number ? null : ""]))])}>
          <Plus className="size-3.5" /> {addLabel}
        </Button>
      </div>
    </div>
  );
}
