"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUploads } from "./upload-manager";

export function RevisionUpload({ fileId, folderId, name }: { fileId: string; folderId: string | null; name: string }) {
  const { upload } = useUploads();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>
        <Upload className="size-3.5" /> New revision
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <Dialog open={!!file} onOpenChange={(o) => !o && setFile(null)}>
        <DialogContent title={`New revision of ${name}`} description={file ? `${file.name} will replace the current revision. Earlier revisions stay available.` : undefined}>
          <Input autoFocus placeholder="What changed? e.g. Increased bracket thickness to 5 mm (CHANGE-024)" value={message} onChange={(e) => setMessage(e.target.value)} />
          <DialogFooter>
            <Button
              variant="primary"
              onClick={() => {
                if (file) {
                  const renamed = new File([file], name, { type: file.type });
                  upload([renamed], { folderId, fileId, message: message || undefined });
                }
                setFile(null);
                setMessage("");
              }}
            >
              Upload revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
