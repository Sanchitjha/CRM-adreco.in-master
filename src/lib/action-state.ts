export type ActionState = {
  error?: string;
  /** Shown after a successful save that stays on the same page. */
  message?: string;
  /** Leads that already match the one being created, so the form can offer to create it anyway. */
  duplicates?: {
    id: string;
    customerName: string;
    phone: string;
    status: string;
    ownerName: string | null;
    /** What the new lead has in common with this one, in plain words. */
    reasons: string[];
  }[];
};

export const INITIAL_ACTION_STATE: ActionState = {};
