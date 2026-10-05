"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

export function NewOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          const org = await api<{ slug: string }>("POST", "/api/v1/orgs", { name, slug, description });
          toast.success(`${name} created`);
          router.push(`/project/new?org=${org.slug}&first=1`);
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError && err.issues?.length ? err.issues.map((i) => i.message).join(". ") : (err as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field label="Organization name" htmlFor="name" hint="Your team, lab or company — e.g. NASA HUNCH Robotics Team">
        <Input
          id="name"
          autoFocus
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!touched) setSlug(slugify(e.target.value));
          }}
        />
      </Field>
      <Field label="URL" htmlFor="slug">
        <div className="flex items-center rounded-md border border-border bg-surface-2 focus-within:border-accent">
          <span className="pl-2.5 font-mono text-xs text-fg-subtle">forgebase/org/</span>
          <input
            id="slug"
            required
            value={slug}
            onChange={(e) => {
              setTouched(true);
              setSlug(slugify(e.target.value));
            }}
            className="h-8 flex-1 bg-transparent pr-2 font-mono text-sm outline-none"
          />
        </div>
      </Field>
      <Field label="Description" htmlFor="desc">
        <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does your team build?" />
      </Field>
      {error ? <p className="rounded-md border border-red/30 bg-red-soft px-3 py-2 text-xs text-red">{error}</p> : null}
      <div>
        <Button type="submit" variant="primary" loading={loading}>
          Create organization
        </Button>
      </div>
    </form>
  );
}
