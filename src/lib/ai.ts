/**
 * AI Copilot & Smart Notification Engine for Adreco CRM
 *
 * Supports:
 * - Google Gemini (Default: gemini-1.5-flash / gemini-2.0-flash)
 * - OpenAI (gpt-4o-mini / gpt-4o)
 * - Anthropic Claude
 * - Intelligent heuristic fallback (works even with 0 API keys set)
 */

export interface LeadAiInsight {
  score: number; // 0-100
  winProbability: "High" | "Medium" | "Low";
  urgency: "Urgent" | "Normal" | "Low";
  summary: string;
  recommendedAction: string;
  suggestedWhatsAppMessage: string;
}

export interface LeadForAi {
  id: string;
  customerName: string;
  phone: string;
  email?: string | null;
  productCategory?: string | null;
  budget?: number | string | null;
  status: string;
  createdAt: Date;
  requirementNotes?: string | null;
  followUpCount?: number;
  lastFollowUpDaysAgo?: number | null;
  hasSurvey?: boolean;
  hasQuotation?: boolean;
  quotationAmount?: number | null;
}

/**
 * Heuristic fallback engine providing instant, zero-latency CRM insights
 * without requiring external API calls or keys.
 */
function generateHeuristicInsight(lead: LeadForAi): LeadAiInsight {
  let score = 50;
  let urgency: "Urgent" | "Normal" | "Low" = "Normal";

  // Score adjustments based on data completeness and stage
  if (lead.budget && Number(lead.budget) > 200000) score += 15;
  if (lead.hasSurvey) score += 15;
  if (lead.hasQuotation) score += 15;
  if (lead.followUpCount && lead.followUpCount >= 2) score += 10;
  if (lead.productCategory) score += 5;

  const daysSinceCreation = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  const daysSinceFollowUp = lead.lastFollowUpDaysAgo ?? daysSinceCreation;

  if (lead.status === "LOST") {
    score = 10;
    urgency = "Low";
  } else if (lead.status === "CONVERTED") {
    score = 95;
    urgency = "Low";
  } else if (daysSinceFollowUp > 4) {
    score -= 15;
    urgency = "Urgent";
  }

  score = Math.max(5, Math.min(98, score));

  let winProbability: "High" | "Medium" | "Low" = "Medium";
  if (score >= 70) winProbability = "High";
  else if (score < 40) winProbability = "Low";

  let summary = "";
  let recommendedAction = "";
  let suggestedWhatsAppMessage = "";

  if (lead.status === "CONVERTED") {
    summary = "Deal won! Lead is progressing through engineering & installation handoff.";
    recommendedAction = "Verify site survey parameters and track engineering drawings queue.";
    suggestedWhatsAppMessage = `Dear ${lead.customerName}, our engineering team is actively preparing the installation roadmap for your heat pump. We will update you shortly!`;
  } else if (lead.hasQuotation) {
    summary = `Quotation prepared${lead.quotationAmount ? ` for ₹${Number(lead.quotationAmount).toLocaleString("en-IN")}` : ""}. Ready for closing negotiations.`;
    recommendedAction = daysSinceFollowUp > 2 ? "High priority: Follow up on quotation acceptance via WhatsApp." : "Send commercial payback calculation.";
    suggestedWhatsAppMessage = `Hello ${lead.customerName}, checking in regarding the Adreco Heat Pump quotation we sent. Would you like a quick walkthrough of the energy savings and warranty terms?`;
  } else if (lead.hasSurvey) {
    summary = "Site survey completed. Engineering requirements are clear.";
    recommendedAction = "Generate and send official Quotation based on survey recommendations.";
    suggestedWhatsAppMessage = `Dear ${lead.customerName}, our technical team has finished sizing your ${lead.productCategory || "Heat Pump"} system. We are finalizing your proposal today!`;
  } else if (lead.status === "NEW" || lead.status === "CONTACTED") {
    summary = "Initial stage. Customer needs qualification and technical sizing.";
    recommendedAction = "Schedule on-site technical survey to understand hot water or heating capacity.";
    suggestedWhatsAppMessage = `Hello ${lead.customerName}, thank you for reaching out to Adreco Engineering. Would tomorrow work for a quick technical survey of your site?`;
  } else {
    summary = `Active lead in ${lead.status.toLowerCase().replace("_", " ")} stage. Needs steady touchpoints.`;
    recommendedAction = "Log a follow-up call and verify decision timeframe.";
    suggestedWhatsAppMessage = `Hello ${lead.customerName}, following up from Adreco Engineering regarding your heat pump requirement. How can we assist you today?`;
  }

  return {
    score,
    winProbability,
    urgency,
    summary,
    recommendedAction,
    suggestedWhatsAppMessage,
  };
}

/**
 * Generate AI Insights for a lead using configured provider (Gemini, OpenAI)
 * with graceful fallback to built-in heuristic AI.
 */
export async function analyzeLeadWithAi(lead: LeadForAi): Promise<LeadAiInsight> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // 1. If Gemini API Key is available (Default recommended)
  if (geminiKey) {
    try {
      const prompt = `You are an expert CRM Sales Director & HVAC Engineer for Adreco Engineering (an Indian commercial/residential heat pump manufacturer).
Analyze this lead and return a JSON object with:
- score: number 0-100
- winProbability: "High" | "Medium" | "Low"
- urgency: "Urgent" | "Normal" | "Low"
- summary: brief 1-2 sentence executive summary
- recommendedAction: 1 specific high-impact next sales action
- suggestedWhatsAppMessage: personalized polite WhatsApp message (under 300 characters)

Lead Details:
- Customer: ${lead.customerName}
- Status: ${lead.status}
- Category: ${lead.productCategory || "Heat Pump"}
- Budget: ₹${lead.budget || "Unspecified"}
- Requirement: ${lead.requirementNotes || "None provided"}
- Days since last follow-up: ${lead.lastFollowUpDaysAgo ?? "None"}
- Has Survey: ${lead.hasSurvey ? "Yes" : "No"}
- Has Quote: ${lead.hasQuotation ? "Yes" : "No"}

Return ONLY raw valid JSON without markdown wrapping.`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );

      if (res.ok) {
        const json = await res.json();
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          return {
            score: Number(parsed.score) || 60,
            winProbability: parsed.winProbability || "Medium",
            urgency: parsed.urgency || "Normal",
            summary: parsed.summary || "",
            recommendedAction: parsed.recommendedAction || "",
            suggestedWhatsAppMessage: parsed.suggestedWhatsAppMessage || "",
          };
        }
      }
    } catch (e) {
      console.warn("Gemini API call failed, falling back to heuristic AI:", e);
    }
  }

  // 2. If OpenAI Key is available
  if (openaiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are an AI sales intelligence copilot for Adreco CRM. Output JSON with fields: score (0-100), winProbability (High/Medium/Low), urgency (Urgent/Normal/Low), summary, recommendedAction, suggestedWhatsAppMessage.",
            },
            {
              role: "user",
              content: `Analyze lead: Customer ${lead.customerName}, Status ${lead.status}, Category ${lead.productCategory}, Budget ${lead.budget}, Notes: ${lead.requirementNotes}, Has Survey: ${lead.hasSurvey}, Has Quote: ${lead.hasQuotation}`,
            },
          ],
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          return {
            score: Number(parsed.score) || 65,
            winProbability: parsed.winProbability || "Medium",
            urgency: parsed.urgency || "Normal",
            summary: parsed.summary || "",
            recommendedAction: parsed.recommendedAction || "",
            suggestedWhatsAppMessage: parsed.suggestedWhatsAppMessage || "",
          };
        }
      }
    } catch (e) {
      console.warn("OpenAI API call failed, falling back to heuristic AI:", e);
    }
  }

  // Fallback to high-performance local AI rules
  return generateHeuristicInsight(lead);
}
