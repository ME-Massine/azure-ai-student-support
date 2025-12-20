import {
  AIVerification,
  AugmentedThread,
  ChatMessage,
  ChatThread,
  ModerationFlag,
  OfficialRule,
  User,
} from "./models";

interface GeneralChatStore {
  users: Record<string, User>;
  threads: Record<string, ChatThread>;
  messages: Record<string, ChatMessage>;
  verifications: Record<string, AIVerification>;
  moderation: Record<string, ModerationFlag>;
  rules: OfficialRule[];
}

function seedRules(): OfficialRule[] {
  const now = new Date().toISOString();
  return [
    {
      ruleId: "attendance-001",
      schoolId: "demo-school",
      language: "en",
      title: "Attendance Check-in",
      content: "Students must check in by 8:15 AM and report absences to the office.",
      category: "attendance",
      lastUpdated: now,
    },
    {
      ruleId: "behavior-002",
      schoolId: "demo-school",
      language: "en",
      title: "Respectful Conduct",
      content: "Bullying, harassment, or discriminatory language is prohibited on all channels.",
      category: "behavior",
      lastUpdated: now,
    },
    {
      ruleId: "exams-003",
      schoolId: "demo-school",
      language: "en",
      title: "Exam Materials",
      content: "Personal electronic devices must be stored away during exams unless accommodations apply.",
      category: "exams",
      lastUpdated: now,
    },
    {
      ruleId: "administrative-004",
      schoolId: "demo-school",
      language: "en",
      title: "ID Badges",
      content: "Students must carry their school ID badge at all times on campus.",
      category: "administrative",
      lastUpdated: now,
    },
  ];
}

function initStore(): GeneralChatStore {
  return {
    users: {},
    threads: {},
    messages: {},
    verifications: {},
    moderation: {},
    rules: seedRules(),
  };
}

const globalStore = (globalThis as any).__generalChatStore || initStore();
if (!(globalThis as any).__generalChatStore) {
  (globalThis as any).__generalChatStore = globalStore;
}

export const store: GeneralChatStore = globalStore;

export function upsertUser(user: User) {
  store.users[user.userId] = user;
  return store.users[user.userId];
}

export function getOrCreateThread(
  schoolId: string,
  createdBy: string
): AugmentedThread {
  const existing = Object.values(store.threads).find(
    (t) => t.schoolId === schoolId && t.isActive
  );

  const thread =
    existing ||
    (() => {
      const threadId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newThread: ChatThread = {
        threadId,
        schoolId,
        createdAt: now,
        createdBy,
        isActive: true,
      };
      store.threads[threadId] = newThread;
      return newThread;
    })();

  return augmentThread(thread.threadId);
}

export function augmentThread(threadId: string): AugmentedThread {
  const thread = store.threads[threadId];
  if (!thread) {
    throw new Error("Thread not found");
  }

  const messages = Object.values(store.messages)
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const users = Object.values(store.users).filter(
    (u) => u.schoolId === thread.schoolId
  );

  const officialRules = store.rules.filter(
    (rule) => rule.schoolId === thread.schoolId
  );

  const verifications = Object.values(store.verifications).filter((v) =>
    messages.some((m) => m.messageId === v.messageId)
  );

  const moderationFlags = Object.values(store.moderation).filter((flag) =>
    messages.some((m) => m.messageId === flag.messageId)
  );

  return {
    ...thread,
    messages,
    users,
    officialRules,
    verifications,
    moderationFlags,
  };
}

export function addMessage(message: Omit<ChatMessage, "messageId">) {
  const messageId = crypto.randomUUID();
  const next: ChatMessage = { ...message, messageId };
  store.messages[messageId] = next;
  return next;
}

export function findMessage(messageId: string) {
  return store.messages[messageId];
}

export function addVerification(
  verification: Omit<AIVerification, "verificationId">,
  verifiedStatus: ChatMessage["verifiedStatus"]
) {
  const verificationId = crypto.randomUUID();
  const record: AIVerification = { ...verification, verificationId };
  store.verifications[verificationId] = record;

  const message = store.messages[verification.messageId];
  if (message) {
    // Preserve original message text; verifiedStatus is derived metadata that can evolve.
    store.messages[verification.messageId] = { ...message, verifiedStatus };
  }

  return record;
}

export function addModerationFlag(flag: Omit<ModerationFlag, "flagId">) {
  const flagId = crypto.randomUUID();
  const record: ModerationFlag = { ...flag, flagId };
  store.moderation[flagId] = record;
  return record;
}

export function listVerifications(messageId: string) {
  return Object.values(store.verifications).filter(
    (v) => v.messageId === messageId
  );
}

export function listModerationFlags(messageId: string) {
  return Object.values(store.moderation).filter(
    (m) => m.messageId === messageId
  );
}

export function getOfficialRules(schoolId: string, language: string) {
  return store.rules.filter(
    (rule) => rule.schoolId === schoolId && rule.language === language
  );
}
