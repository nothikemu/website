"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ResourceForm } from "@/components/forms/resource-form";
import { TEST_STATUS } from "@/lib/status";

export function RecordRun({ project, number, files }: { project: string; number: number; files: { id: string; path: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary">
          <Play className="size-3.5" /> Record result
        </Button>
      </DialogTrigger>
      <DialogContent title="Record test run" description="Results are immutable once recorded — add a new run to correct them." wide>
        <ResourceForm
          method="POST"
          action={`/api/v1/projects/${project}/tests/${number}/runs`}
          submitLabel="Save run"
          redirectTo={`/project/${project}/tests/${number}`}
          initial={{ status: "passed", measurements: [] }}
          layout="grid"
          transform={(p) => ({ ...p, attachments: p.attachments ? [p.attachments] : [] })}
          fields={[
            { name: "status", label: "Result", type: "select", options: Object.entries(TEST_STATUS).map(([v, m]) => ({ value: v, label: m.label })) },
            { name: "actual", label: "Actual result", type: "text", placeholder: "No failure at 620 N" },
            { name: "measurements", label: "Measurements", type: "measurements" },
            { name: "notes", label: "Notes", type: "markdown", rows: 4, placeholder: "Conditions, anomalies, photos referenced…" },
            ...(files.length ? [{ name: "attachments", label: "Attach data / media", type: "select" as const, options: [{ value: "", label: "None" }, ...files.map((f) => ({ value: f.id, label: f.path }))] }] : []),
          ]}
        />
      </DialogContent>
    </Dialog>
  );
}
