export type UserRole = "student" | "senior" | "moderator";
export type SenderRole = Exclude<UserRole, "moderator"> | "ai";

export type MessageType =
  | "question"
  | "student_answer"
  | "ai_verification"
  | "official_reference"
  | "system_warning";

export type VerifiedStatus =
  | "unverified"
  | "verified"
  | "partially_verified"
  | "conflict";

export interface User {
  userId: string;
  acsUserId: string;
  role: UserRole;
  schoolId: string;
  language: string;
}

export interface ChatThread {
  threadId: string;
  schoolId: string;
  createdAt: string;
  createdBy: string;
  isActive: boolean;
}

export interface ChatMessage {
  messageId: string;
  threadId: string;
  senderId: string;
  senderRole: SenderRole;
  createdAt: string;
  messageType: MessageType;
  verifiedStatus: VerifiedStatus;
  content: string;
  relatedMessageId?: string;
}

export interface ChatMessageMetadata {
  messageId: string;
  threadId: string;
  senderId: string;
  senderRole: SenderRole;
  createdAt: string;
  messageType: MessageType;
  verifiedStatus: VerifiedStatus;
  relatedMessageId?: string;
}

export type VerificationResult =
  | "confirmed"
  | "partially_correct"
  | "incorrect";

export type VerificationVerdict = VerificationResult | "unverified";
export type VerificationFailureReason = "ai_unavailable";

export interface SuccessfulAIVerification {
  verificationId: string;
  messageId: string;
  verificationResult: VerificationResult;
  verdict: VerificationResult;
  explanation: string;
  officialSourceIds: string[];
  createdAt: string;
}

export interface UnverifiedAIVerification {
  verificationId: string;
  messageId: string;
  verdict: "unverified";
  reason: VerificationFailureReason;
  requiresHumanReview: true;
  createdAt: string;
}

export type AIVerification =
  | SuccessfulAIVerification
  | UnverifiedAIVerification;

export type NewAIVerification = Omit<AIVerification, "verificationId">;

export function isSuccessfulVerification(
  verification: AIVerification | NewAIVerification
): verification is
  | SuccessfulAIVerification
  | (NewAIVerification & { verificationResult: VerificationResult; verdict: VerificationResult }) {
  if (verification.verdict === "unverified") {
    return false;
  }
  return (
    "verificationResult" in verification &&
    verification.verificationResult !== undefined
  );
}

export type ModerationSeverity = "low" | "medium" | "high";
export type ModerationAction = "none" | "warning_posted" | "review_required";

export interface ModerationMetadata {
  source: string;
  categories: Record<string, number>;
  blocked: boolean;
  createdAt: string;
}

export interface ModerationFlag {
  flagId: string;
  messageId: string;
  severity: ModerationSeverity;
  reason: string;
  actionTaken: ModerationAction;
  createdAt: string;
  metadata?: ModerationMetadata;
}

export type RuleCategory =
  | "attendance"
  | "behavior"
  | "exams"
  | "administrative";

export interface OfficialRule {
  ruleId: string;
  schoolId: string;
  language: string;
  title: string;
  content: string;
  category: RuleCategory;
  lastUpdated: string;
}

export interface AugmentedThread extends ChatThread {
  messages: ChatMessage[];
  users: User[];
  officialRules: OfficialRule[];
  verifications: AIVerification[];
  moderationFlags: ModerationFlag[];
}
