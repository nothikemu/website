"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ResourceForm, type FieldDef } from "@/components/forms/resource-form";

export function NewTaskDialog({ project, fields, defaultOpen, parentId, label = "New task" }: { project: string; fields: FieldDef[]; defaultOpen?: boolean; parentId?: string; label?: string }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={parentId ? "outline" : "primary"}>
          <Plus className="size-3.5" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={parentId ? "New subtask" : "New task"} wide>
        <ResourceForm
          method="POST"
          action={`/api/v1/projects/${project}/tasks`}
          submitLabel="Create task"
          initial={{ status: "todo", priority: "none" }}
          layout="grid"
          fields={fields}
          transform={(p) => (parentId ? { ...p, parentId } : p)}
          onSuccessHref={parentId ? undefined : `/project/${project}/tasks/{number}`}
        />
      </DialogContent>
    </Dialog>
  );
}
