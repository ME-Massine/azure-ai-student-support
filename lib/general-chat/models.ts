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
  content: string;
  createdAt: string;
  messageType: MessageType;
  verifiedStatus: VerifiedStatus;
  relatedMessageId?: string;
}

export type VerificationResult =
  | "confirmed"
  | "partially_correct"
  | "incorrect";

export interface AIVerification {
  verificationId: string;
  messageId: string;
  verificationResult: VerificationResult;
  explanation: string;
  officialSourceIds: string[];
  createdAt: string;
}

export type ModerationSeverity = "low" | "medium" | "high";
export type ModerationAction = "none" | "warning_posted" | "review_required";

export interface ModerationFlag {
  flagId: string;
  messageId: string;
  severity: ModerationSeverity;
  reason: string;
  actionTaken: ModerationAction;
  createdAt: string;
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
