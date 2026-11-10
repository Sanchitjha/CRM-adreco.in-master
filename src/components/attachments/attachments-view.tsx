"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Film, ImageOff, Trash2, Upload } from "lucide-react";
import { confirmAttachment, removeAttachment, requestAttachmentUpload } from "@/app/(dashboard)/attachment-actions";
import { ATTACHMENT_ACCEPT, formatBytes, type AttachmentKind } from "@/lib/attachments";

export type AttachmentItem = {
  id: string;
  fileName: string;
  size: number;
  kind: AttachmentKind;
  /** A link that works for an hour, or null when file storage is not set up. */
  url: string | null;
  uploadedByName: string;
  createdAt: string;
  canRemove: boolean;
};

export function AttachmentsView({
  entityType,
  entityId,
  items,
  canUpload,
  storageReady,
}: {
  entityType: string;
  entityId: string;
  items: AttachmentItem[];
  canUpload: boolean;
  storageReady: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [removing, startRemoving] = useTransition();

  async function uploadAll(files: File[]) {
    setBusy(true);
    setProblems([]);
    const failed: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Sending ${i + 1} of ${files.length}: ${file.name}`);
      try {
        const asked = await requestAttachmentUpload(entityType, entityId, file.name, file.type, file.size);
        if (!asked.ok) throw new Error(asked.error);
        const { ticket } = asked;
        // The link is signed for exactly this content type, so the upload must send the same one.
        const sent = await fetch(ticket.url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": ticket.contentType },
        });
        if (!sent.ok) throw new Error("The file could not be sent to storage.");
        const done = await confirmAttachment(entityType, entityId, ticket.id, ticket.key, ticket.fileName, ticket.contentType);
        if (!done.ok) throw new Error(done.error);
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof Error ? err.message : "Upload failed."}`);
      }
    }

    setProblems(failed);
    setStatus(failed.length === files.length ? null : `Added ${files.length - failed.length} of ${files.length}.`);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void uploadAll(files);
  }

  function remove(item: AttachmentItem) {
    if (!window.confirm(`Remove "${item.fileName}" from this list?`)) return;
    startRemoving(async () => {
      const result = await removeAttachment(item.id);
      if (!result.ok) setProblems([result.error]);
      router.refresh();
    });
  }

  const photosAndVideos = items.filter((i) => i.kind !== "file");
  const files = items.filter((i) => i.kind === "file");

  return (
    <div className="space-y-4">
      {canUpload && (
        <div className="flex flex-wrap items-center gap-3">
          <label className={`btn btn-secondary btn-sm ${busy || !storageReady ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
            <Upload className="size-3.5" />
            {busy ? "Uploading…" : "Add photos, videos or files"}
            <input
              ref={input}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              disabled={busy || !storageReady}
              onChange={onPick}
            />
          </label>
          <span className="text-xs text-slate-400">Photos up to 15 MB, videos up to 300 MB, documents up to 25 MB.</span>
        </div>
      )}
      {!storageReady && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          File storage is not set up on this server, so files cannot be added or shown yet.
        </p>
      )}
      {status && <p className="text-sm text-slate-600">{status}</p>}
      {problems.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing added yet.</p>
      ) : (
        <>
          {photosAndVideos.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photosAndVideos.map((item) => (
                <li key={item.id} className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
                  <Preview item={item} />
                  <Caption item={item} onRemove={() => remove(item)} disabled={removing} />
                </li>
              ))}
            </ul>
          )}
          {files.length > 0 && (
            <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {files.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                  <FileText className="size-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-brand-600 hover:underline">
                        {item.fileName}
                      </a>
                    ) : (
                      <span className="block truncate text-sm font-medium text-slate-700">{item.fileName}</span>
                    )}
                    <span className="text-xs text-slate-400">{meta(item)}</span>
                  </div>
                  {item.canRemove && (
                    <button type="button" onClick={() => remove(item)} disabled={removing} className="btn btn-ghost btn-sm" aria-label={`Remove ${item.fileName}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function meta(item: AttachmentItem): string {
  return `${formatBytes(item.size)} · ${item.uploadedByName} · ${new Date(item.createdAt).toLocaleDateString("en-IN")}`;
}

function Preview({ item }: { item: AttachmentItem }) {
  const [broken, setBroken] = useState(false);

  if (!item.url) {
    return <div className="flex aspect-video items-center justify-center bg-slate-50 text-slate-300">{item.kind === "video" ? <Film className="size-8" /> : <ImageOff className="size-8" />}</div>;
  }
  if (item.kind === "video") {
    return <video src={item.url} controls preload="metadata" className="aspect-video w-full bg-black" />;
  }
  if (broken) {
    // Some phone formats (HEIC) do not display in every browser; the file is still there to open.
    return (
      <a href={item.url} target="_blank" rel="noreferrer" className="flex aspect-video flex-col items-center justify-center gap-1 bg-slate-50 text-xs text-slate-500">
        <ImageOff className="size-6" />
        Open the photo
      </a>
    );
  }
  return (
    <a href={item.url} target="_blank" rel="noreferrer" className="block">
      {/* The link is a short-lived signed address, so the plain element is the right one here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt={item.fileName} loading="lazy" onError={() => setBroken(true)} className="aspect-video w-full object-cover" />
    </a>
  );
}

function Caption({ item, onRemove, disabled }: { item: AttachmentItem; onRemove: () => void; disabled: boolean }) {
  return (
    <div className="flex items-start gap-2 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-700" title={item.fileName}>
          {item.fileName}
        </p>
        <p className="truncate text-[11px] text-slate-400">{meta(item)}</p>
      </div>
      {item.canRemove && (
        <button type="button" onClick={onRemove} disabled={disabled} className="text-slate-400 hover:text-rose-600" aria-label={`Remove ${item.fileName}`}>
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}
