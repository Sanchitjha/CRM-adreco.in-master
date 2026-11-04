"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleCheck, Mail, Paperclip, TriangleAlert } from "lucide-react";
import { sendLeadEmail } from "@/app/(dashboard)/leads/email-actions";
import { Badge } from "@/components/ui";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { formatDateTime } from "@/lib/dates";

export type EmailRecipient = { email: string; label: string };
export type EmailTemplateOption = { id: string; label: string; subject: string; body: string };
export type AttachableDocument = { id: string; fileName: string };
export type SentEmailRow = {
  id: string;
  subject: string;
  to: string;
  cc: string | null;
  sentBy: string;
  at: string;
  status: "SENT" | "FAILED";
  error: string | null;
  body: string;
  attachments: string[];
};

export function LeadEmailPanel({
  leadId,
  recipients,
  templates,
  documents,
  history,
  configured,
  signature,
}: {
  leadId: string;
  recipients: EmailRecipient[];
  templates: EmailTemplateOption[];
  documents: AttachableDocument[];
  history: SentEmailRow[];
  configured: boolean;
  /** The sign-off that is added to every email, shown so the writer knows what the customer will see. */
  signature: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(sendLeadEmail, INITIAL_ACTION_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Until the page has hydrated there is no handler yet, so hold the button back rather than let the browser post
  // the form on its own.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (state.message && !state.error) formRef.current?.reset();
  }, [state]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // Dispatching by hand keeps what the person typed if the server turns the email down, so they can correct it.
    startTransition(() => formAction(data));
  }

  function applyTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template || !subjectRef.current || !bodyRef.current) return;
    subjectRef.current.value = template.subject;
    bodyRef.current.value = template.body;
  }

  return (
    <div className="space-y-4">
      {!configured && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Email is not set up yet. An administrator needs to add the mail server settings before emails can be sent.
        </p>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} disabled={!configured} className="btn btn-primary btn-sm">
          <Mail className="size-3.5" />
          Write an email
        </button>
      ) : (
        <form ref={formRef} method="post" onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-[var(--border)] p-4">
          <input type="hidden" name="leadId" value={leadId} />

          <fieldset>
            <legend className="label">To</legend>
            {recipients.length === 0 ? (
              <p className="text-sm text-slate-400">This lead has no email address yet. Type one below.</p>
            ) : (
              <div className="space-y-1">
                {recipients.map((r, i) => (
                  <label key={r.email} className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      name="to"
                      value={r.email}
                      defaultChecked={i === 0}
                      className="mt-0.5 size-4 rounded border-slate-300 accent-[var(--primary)]"
                    />
                    <span className="text-sm text-slate-700">{r.label}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="email-extra">
                Other addresses
              </label>
              <input id="email-extra" name="toExtra" type="text" placeholder="name@company.com, …" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="email-cc">
                Cc
              </label>
              <input id="email-cc" name="cc" type="text" placeholder="Optional" className="input" />
            </div>
          </div>

          {templates.length > 0 && (
            <div>
              <label className="label" htmlFor="email-template">
                Start from
              </label>
              <select
                id="email-template"
                defaultValue=""
                onChange={(e) => applyTemplate(e.target.value)}
                className="select"
              >
                <option value="">A blank email</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label" htmlFor="email-subject">
              Subject <span className="text-rose-500">*</span>
            </label>
            <input id="email-subject" ref={subjectRef} name="subject" type="text" required maxLength={200} className="input" />
          </div>

          <div>
            <label className="label" htmlFor="email-body">
              Message <span className="text-rose-500">*</span>
            </label>
            <textarea id="email-body" ref={bodyRef} name="body" required rows={9} maxLength={20000} className="textarea" />
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 font-sans text-xs text-slate-500">
              {signature}
            </pre>
            <p className="mt-1 text-xs text-slate-400">This sign-off is added automatically.</p>
          </div>

          {documents.length > 0 && (
            <fieldset>
              <legend className="label">Attach files from this lead</legend>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
                {documents.map((d) => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      name="attach"
                      value={d.id}
                      className="size-4 rounded border-slate-300 accent-[var(--primary)]"
                    />
                    <Paperclip className="size-3.5 text-slate-400" />
                    <span className="truncate text-sm text-slate-700">{d.fileName}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">Up to 7 MB in total.</p>
            </fieldset>
          )}

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              name="copyMe"
              defaultChecked
              className="size-4 rounded border-slate-300 accent-[var(--primary)]"
            />
            <span className="text-sm text-slate-700">Send me a copy</span>
          </label>

          {state.error && (
            <p className="form-error flex items-start gap-2" role="alert">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {state.error}
            </p>
          )}
          {!state.error && state.message && (
            <p className="flex items-center gap-2 text-sm text-emerald-600" role="status">
              <CircleCheck className="size-4 shrink-0" />
              {state.message}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending || !hydrated} className="btn btn-primary">
              {pending ? "Sending…" : "Send email"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">
              Close
            </button>
          </div>
        </form>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sent from the CRM</h3>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">No emails sent to this customer from the CRM yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {history.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <details>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{e.subject}</span>
                      <span className="block truncate text-xs text-slate-400">
                        To {e.to}
                        {e.cc ? ` · Cc ${e.cc}` : ""} · {e.sentBy} · {formatDateTime(e.at)}
                      </span>
                    </span>
                    <Badge tone={e.status === "SENT" ? "success" : "danger"}>{e.status === "SENT" ? "Sent" : "Failed"}</Badge>
                  </summary>
                  <div className="mt-3 space-y-2">
                    {e.error && <p className="form-error">{e.error}</p>}
                    <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{e.body}</p>
                    {e.attachments.length > 0 && (
                      <p className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Paperclip className="size-3.5" />
                        {e.attachments.join(", ")}
                      </p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
