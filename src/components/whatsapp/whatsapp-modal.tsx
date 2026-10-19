"use client";

import { useState, useTransition } from "react";
import { MessageCircle, Send, Copy, Check, ExternalLink, Sparkles, X, RefreshCw } from "lucide-react";
import {
  WHATSAPP_TEMPLATES,
  buildWhatsAppLink,
  type WhatsAppTemplateId,
  type WhatsAppTemplateData,
} from "@/lib/whatsapp";
import { logWhatsAppInteraction } from "@/app/(dashboard)/leads/actions";

export interface WhatsAppButtonProps {
  customerName: string;
  phone: string;
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

export function WhatsAppAction({
  customerName,
  phone,
  leadId,
  productCategory,
  budget,
  quoteNumber,
  grandTotal,
  surveyApplication,
  suggestedMessage,
  variant = "icon",
  label = "WhatsApp",
  className = "",
}: WhatsAppButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplateId>(
    suggestedMessage ? "custom" : "lead_intro",
  );
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const templateData: WhatsAppTemplateData = {
    customerName,
    phone,
    productCategory,
    budget,
    quoteNumber,
    grandTotal,
    surveyApplication,
    customMessage: suggestedMessage,
  };

  const currentTemplate = WHATSAPP_TEMPLATES.find((t) => t.id === selectedTemplate) || WHATSAPP_TEMPLATES[0];
  const [messageText, setMessageText] = useState(() => currentTemplate.generateText(templateData));

  // Change template handler
  function handleTemplateChange(templateId: WhatsAppTemplateId) {
    setSelectedTemplate(templateId);
    const tmpl = WHATSAPP_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      setMessageText(tmpl.generateText(templateData));
    }
  }

  // Handle direct launch
  function handleOpenWhatsApp() {
    const link = buildWhatsAppLink(phone, messageText);
    window.open(link, "_blank", "noopener,noreferrer");

    // Automatically record interaction on lead
    if (leadId) {
      startTransition(async () => {
        await logWhatsAppInteraction({
          leadId,
          phone,
          message: messageText,
          templateId: selectedTemplate,
        });
        setStatusMessage({ text: "Message logged to lead timeline!", tone: "success" });
        setTimeout(() => setOpen(false), 1200);
      });
    }
  }

  // Handle Copy
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
          title={`WhatsApp ${customerName}`}
          className={`flex size-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-800 ${className}`}
        >
          <MessageCircle className="size-4 fill-emerald-600 text-emerald-600" />
        </button>
      ) : variant === "small" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 ${className}`}
        >
          <MessageCircle className="size-3.5 fill-emerald-600 text-emerald-600" />
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 ${className}`}
        >
          <MessageCircle className="size-4 fill-white text-white" />
          {label}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setOpen(false)}
          />

          {/* Modal Panel */}
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md">
                  <MessageCircle className="size-5 text-white" />
                </span>
                <div>
                  <h3 className="text-base font-semibold leading-tight">WhatsApp Client Hub</h3>
                  <p className="text-xs text-emerald-100">
                    To: {customerName} ({phone})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-emerald-100 transition hover:bg-white/10 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {/* Template Picker */}
              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Select Message Template</span>
                  {suggestedMessage && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600">
                      <Sparkles className="size-3" /> AI Draft Available
                    </span>
                  )}
                </label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value as WhatsAppTemplateId)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 transition focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  {WHATSAPP_TEMPLATES.map((tmpl) => (
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
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-mono text-slate-800 transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="Enter message to send..."
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
                  onClick={handleOpenWhatsApp}
                  disabled={isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50"
                >
                  {isPending ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <>
                      <ExternalLink className="size-4" />
                      Open in WhatsApp & Log Note
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
