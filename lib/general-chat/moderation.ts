import { ChatMessage, ModerationFlag, ModerationSeverity } from "./models";

const HIGH_RISK_KEYWORDS = ["threat", "violence", "bully", "harass"];
const MEDIUM_RISK_KEYWORDS = ["cheat", "plagiarize", "skip class"];

export function evaluateModeration(message: ChatMessage) {
  const content = message.content.toLowerCase();
  let severity: ModerationSeverity = "low";
  let reason = "Routine scan";

  if (HIGH_RISK_KEYWORDS.some((k) => content.includes(k))) {
    severity = "high";
    reason = "High-risk keyword detected";
  } else if (MEDIUM_RISK_KEYWORDS.some((k) => content.includes(k))) {
    severity = "medium";
    reason = "Possible policy violation";
  }

  const actionTaken: ModerationFlag["actionTaken"] =
    severity === "high" ? "warning_posted" : severity === "medium" ? "review_required" : "none";

  return { severity, reason, actionTaken };
}
