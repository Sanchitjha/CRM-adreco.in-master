/** Starting points for the emails sent from a lead. The employee reads and edits the text before sending. */

export type QuoteSummary = {
  number: string;
  dateLabel: string;
  validUntilLabel: string | null;
  lines: { description: string; quantity: number; amountLabel: string }[];
  totalLabel: string;
};

export type EmailTemplateContext = {
  customerName: string;
  productCategory?: string | null;
  quote?: QuoteSummary | null;
};

export type EmailTemplate = { id: string; label: string; subject: string; body: string };

function greeting(customerName: string): string {
  const name = customerName.trim();
  return name ? `Dear ${name},` : "Hello,";
}

export function emailTemplates(context: EmailTemplateContext): EmailTemplate[] {
  const { customerName, productCategory, quote } = context;
  const about = productCategory ? ` about ${productCategory}` : "";

  const templates: EmailTemplate[] = [
    {
      id: "enquiry",
      label: "Thank you for your enquiry",
      subject: "Thank you for your enquiry",
      body: [
        greeting(customerName),
        "",
        `Thank you for getting in touch with us${about}. We would be glad to help.`,
        "",
        "To prepare the right proposal, could you please share the location of the site, your hot water requirement and a convenient time for a call?",
      ].join("\n"),
    },
    {
      id: "followup",
      label: "Follow-up",
      subject: "Following up on your enquiry",
      body: [
        greeting(customerName),
        "",
        `I am following up on your enquiry${about}. Please let me know if you have any questions or would like to take the next step.`,
        "",
        "I would be happy to arrange a call or a site visit at a time that suits you.",
      ].join("\n"),
    },
  ];

  if (quote) {
    const lines = quote.lines.map((l, i) => `${i + 1}. ${l.description} (qty ${l.quantity}): ${l.amountLabel}`);
    templates.push({
      id: "quotation",
      label: `Quotation ${quote.number}`,
      subject: `Quotation ${quote.number}`,
      body: [
        greeting(customerName),
        "",
        `Please find our quotation ${quote.number} dated ${quote.dateLabel}${
          quote.validUntilLabel ? `, valid until ${quote.validUntilLabel}` : ""
        }.`,
        "",
        ...lines,
        "",
        `Total (including taxes and charges): ${quote.totalLabel}`,
        "",
        "Please let us know if you would like to discuss anything or go ahead.",
      ].join("\n"),
    });
  }

  return templates;
}
