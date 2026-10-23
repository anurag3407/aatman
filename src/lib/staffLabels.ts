import type { TriageReason } from "@/lib/safety/triage";

/** Clinician-facing wording for triage reason codes (staff portal is English-only). */
export const REASON_LABELS: Record<TriageReason, string> = {
  cssrs_high: "C-SSRS high risk: intent, plan, or suicidal behaviour in the past 3 months",
  cssrs_moderate: "C-SSRS moderate: method considered, or past suicidal behaviour (> 3 months)",
  cssrs_active_thoughts: "Active suicidal thoughts, no method",
  cssrs_passive_wish: "Passive death wish only",
  cssrs_incomplete: "C-SSRS left incomplete after a positive item 9",
  cssrs_pending: "C-SSRS not answered after a positive item 9",
  safety_item_positive: "PHQ-9 item 9 positive (C-SSRS all no)",
  safety_item_skipped: "PHQ-9 item 9 skipped",
  text_acute: "Free text contained acute-risk language",
  text_self_harm: "Free text contained self-harm language",
  text_passive: "Free text contained passive-ideation language",
  phq9_moderate_plus: "PHQ-9 ≥ 10",
  gad7_moderate_plus: "GAD-7 ≥ 10",
  phq2_positive: "PHQ-2 ≥ 3 (full PHQ-9 not completed)",
  gad2_positive: "GAD-2 ≥ 3 (full GAD-7 not completed)",
  who5_very_low: "WHO-5 ≤ 28",
};

export const TIER_LABELS = {
  crisis: "Crisis",
  urgent: "Urgent",
  elevated: "Elevated",
  moderate: "Moderate",
  mild: "Mild",
} as const;

export const TIER_BADGE = {
  crisis: "bg-urgent text-urgent-foreground",
  urgent: "border border-urgent text-urgent",
  elevated: "bg-accent-soft",
  moderate: "bg-accent-soft",
  mild: "border border-border text-muted",
} as const;
