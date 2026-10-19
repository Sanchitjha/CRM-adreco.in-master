"use client";

import { useState, useTransition } from "react";
import { MessageSquare, Send, Copy, Check, ExternalLink, Sparkles, X, RefreshCw } from "lucide-react";
import {
  ZOHO_CHAT_TEMPLATES,
  buildZohoChatLink,
  type ZohoChatTemplateId,
  type ZohoChatTemplateData,
} from "@/lib/zoho-chat";
import { logZohoChatInteraction } from "@/app/(dashboard)/leads/actions";

export interface ZohoChatButtonProps {
  customerName: string;
  phone: string;
  email?: string | null;
  leadId?: string;
  productCategory?: string | null;
  budget?: number | string | null;
  quoteNumber?: string | null;
  grandTotal?: number | string | null;
  surveyApplication?: string | null;
  suggestedMessage?: string;
  variant?: "icon" | "button" | "small";
  label?: string;
  className?: string;
}

export function ZohoChatAction({
  customerName,
  phone,
  email,
  leadId,
  productCategory,
  budget,
  quoteNumber,
  grandTotal,
  surveyApplication,
  suggestedMessage,
  variant = "icon",
  label = "Zoho Chat",
  className = "",
}: ZohoChatButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ZohoChatTemplateId>(
    suggestedMessage ? "custom" : "lead_welcome",
  );
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const templateData: ZohoChatTemplateData = {
    customerName,
    phone,
    email,
    productCategory,
    budget,
    quoteNumber,
    grandTotal,
    surveyApplication,
    customMessage: suggestedMessage,
  };

  const currentTemplate =
    ZOHO_CHAT_TEMPLATES.find((t) => t.id === selectedTemplate) || ZOHO_CHAT_TEMPLATES[0];
  const [messageText, setMessageText] = useState(() => currentTemplate.generateText(templateData));

  function handleTemplateChange(templateId: ZohoChatTemplateId) {
    setSelectedTemplate(templateId);
    const tmpl = ZOHO_CHAT_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      setMessageText(tmpl.generateText(templateData));
    }
  }

  function handleOpenZohoChat() {
    const link = buildZohoChatLink({
      customerName,
      email,
      phone,
    });

    // Check if Zoho SalesIQ widget is loaded on page
    if (typeof window !== "undefined" && (window as unknown as { $zoho?: { salesiq?: { floatwindow?: { visible: (v: string) => void } } } }).$zoho?.salesiq) {
      try {
        (window as unknown as { $zoho: { salesiq: { floatwindow: { visible: (v: string) => void } } } }).$zoho.salesiq.floatwindow.visible("show");
      } catch {
        window.open(link, "_blank", "noopener,noreferrer");
      }
    } else {
      window.open(link, "_blank", "noopener,noreferrer");
    }

    if (leadId) {
      startTransition(async () => {
        await logZohoChatInteraction({
          leadId,
          phone,
          message: messageText,
          templateId: selectedTemplate,
        });
        setStatusMessage({ text: "Message logged to lead history!", tone: "success" });
        setTimeout(() => setOpen(false), 1200);
      });
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`Zoho Chat with ${customerName}`}
          className={`flex size-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 hover:text-red-700 ${className}`}
        >
          <MessageSquare className="size-4 fill-red-500/20 text-red-600" />
        </button>
      ) : variant === "small" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 ${className}`}
        >
          <MessageSquare className="size-3.5 text-red-600" />
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 ${className}`}
        >
          <MessageSquare className="size-4 fill-white text-white" />
          {label}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setOpen(false)}
          />

          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all">
            {/* Header with Zoho Enterprise Colors */}
            <div className="flex items-center justify-between border-b border-red-700/20 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md">
                  <MessageSquare className="size-5 text-white" />
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-base font-semibold leading-tight">Zoho SalesIQ Chat</h3>
                    <span className="rounded bg-white/25 px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider text-white">
                      Zoho
                    </span>
                  </div>
                  <p className="text-xs text-red-100">
                    To: {customerName} ({phone})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-red-100 transition hover:bg-white/10 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {/* Template Picker */}
              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Select Zoho Message Template</span>
                  {suggestedMessage && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                      <Sparkles className="size-3" /> AI Draft Ready
                    </span>
                  )}
                </label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value as ZohoChatTemplateId)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 transition focus:border-red-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200"
                >
                  {ZOHO_CHAT_TEMPLATES.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.label} — {tmpl.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Message Preview & Editor */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Message Body</label>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-800"
                  >
                    {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-mono text-slate-800 transition placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200"
                  placeholder="Enter message for Zoho Chat..."
                />
              </div>

              {/* Status Message */}
              {statusMessage && (
                <div
                  className={`rounded-lg px-3.5 py-2 text-xs font-medium ${
                    statusMessage.tone === "success"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {statusMessage.text}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn btn-secondary sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleOpenZohoChat}
                  disabled={isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 active:scale-[0.99] disabled:opacity-50"
                >
                  {isPending ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <>
                      <ExternalLink className="size-4" />
                      Start Zoho Chat & Log Note
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
