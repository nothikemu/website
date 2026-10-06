"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ResourceForm } from "@/components/forms/resource-form";

export function NewMilestone({ project }: { project: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary">
          <Plus className="size-3.5" /> New milestone
        </Button>
      </DialogTrigger>
      <DialogContent title="New milestone">
        <ResourceForm
          method="POST"
          action={`/api/v1/projects/${project}/milestones`}
          submitLabel="Create milestone"
          redirectTo={`/project/${project}/milestones`}
          fields={[
            { name: "title", label: "Title", type: "text", required: true, placeholder: "Drive System" },
            { name: "dueDate", label: "Due date", type: "date" },
            { name: "description", label: "Goal", type: "markdown", rows: 3, placeholder: "What must be true when this milestone is done?" },
          ]}
        />
      </DialogContent>
    </Dialog>
  );
}
