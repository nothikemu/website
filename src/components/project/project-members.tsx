"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { api } from "@/lib/api-client";

export function AddProjectMember({ project, candidates }: { project: string; candidates: { id: string; displayName: string; username: string }[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("engineer");
  return (
    <div className="flex flex-wrap gap-2">
      <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="min-w-56 flex-1">
        <option value="">Choose an organization member…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.displayName} (@{c.username})
          </option>
        ))}
      </Select>
      <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-36">
        <option value="admin">Admin</option>
        <option value="engineer">Engineer</option>
        <option value="viewer">Viewer</option>
      </Select>
      <Button
        variant="primary"
        disabled={!userId}
        onClick={async () => {
          try {
            await api("POST", `/api/v1/projects/${project}/members`, { userId, role });
            toast.success("Member added");
            setUserId("");
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        Add
      </Button>
    </div>
  );
}
