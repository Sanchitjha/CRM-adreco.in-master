"use client";

import { useState, useTransition, type FormEvent } from "react";
import { FileText, Upload, ExternalLink, Plus } from "lucide-react";
import type { DocumentStatus } from "@prisma/client";
import {
  addCustomDocumentRequirement,
  confirmUpload,
  requestDownloadUrl,
  requestUploadUrl,
  updateDocumentStatus,
} from "@/app/(dashboard)/leads/document-actions";

export type DocumentRow = {
  id: string;
  docType: string;
  status: DocumentStatus;
  fileName: string | null;
  uploadedAt: string | null;
  uploadedByName: string | null;
};

const STATUS_OPTIONS: DocumentStatus[] = ["REQUIRED", "RECEIVED", "SUBMITTED", "APPROVED"];

export function DocumentsSection({
  leadId,
  documents,
  canAddRequirement,
}: {
  leadId: string;
  documents: DocumentRow[];
  canAddRequirement: boolean;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2.5 border-b border-[var(--border)] px-5 py-3.5">
        <FileText className="size-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900">Documents</h2>
      </header>
      <div className="px-5 py-4">
        {documents.length === 0 ? (
          <p className="text-sm text-slate-400">No documents required yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {documents.map((doc) => (
              <DocumentItem key={doc.id} doc={doc} />
            ))}
          </ul>
        )}

        {canAddRequirement && <AddRequirementForm leadId={leadId} />}
      </div>
    </section>
  );
}

function DocumentItem({ doc }: { doc: DocumentRow }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const { url, key } = await requestUploadUrl(doc.id, file.name, file.type || "application/octet-stream");
        const res = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!res.ok) throw new Error("Upload to storage failed.");
        await confirmUpload(doc.id, key, file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      try {
        const url = await requestDownloadUrl(doc.id);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open document.");
      }
    });
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value as DocumentStatus;
    setError(null);
    startTransition(async () => {
      try {
        await updateDocumentStatus(doc.id, status);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update status.");
      }
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-slate-50/40 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800">{doc.docType}</span>
          {doc.fileName && <span className="truncate text-xs text-slate-500">{doc.fileName}</span>}
        </div>
        {doc.uploadedByName && (
          <p className="mt-0.5 text-xs text-slate-400">
            Uploaded by {doc.uploadedByName}
            {doc.uploadedAt ? ` on ${new Date(doc.uploadedAt).toLocaleDateString("en-IN")}` : ""}
          </p>
        )}
        {error && <p className="mt-0.5 text-xs text-rose-600">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <select
          value={doc.status}
          onChange={handleStatusChange}
          disabled={pending}
          aria-label="Document status"
          className="select w-auto py-1.5 text-xs"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        {doc.fileName ? (
          <button type="button" onClick={handleDownload} disabled={pending} className="btn btn-secondary btn-sm">
            <ExternalLink className="size-3.5" />
            View
          </button>
        ) : (
          <label className="btn btn-secondary btn-sm cursor-pointer">
            <Upload className="size-3.5" />
            {pending ? "Uploading…" : "Upload"}
            <input type="file" className="hidden" disabled={pending} onChange={handleFileChange} />
          </label>
        )}
      </div>
    </li>
  );
}

function AddRequirementForm({ leadId }: { leadId: string }) {
  const [docType, setDocType] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!docType.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await addCustomDocumentRequirement(leadId, docType.trim());
        setDocType("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add requirement.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3.5">
      <input
        type="text"
        value={docType}
        onChange={(e) => setDocType(e.target.value)}
        placeholder="Add another required document…"
        className="input flex-1 py-1.5 text-sm"
      />
      <button type="submit" disabled={pending} className="btn btn-secondary btn-sm">
        <Plus className="size-3.5" />
        {pending ? "Adding…" : "Add"}
      </button>
      {error && <span className="form-error">{error}</span>}
    </form>
  );
}
