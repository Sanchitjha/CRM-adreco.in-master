export type ActionState = {
  error?: string;
  /** Shown after a successful save that stays on the same page. */
  message?: string;
};

export const INITIAL_ACTION_STATE: ActionState = {};
