import { Container } from "@azure/cosmos";
import { database } from "@/lib/cosmos/client";
import {
  AIVerification,
  AugmentedThread,
  ChatMessage,
  ChatMessageMetadata,
  ChatThread,
  ModerationFlag,
  ModerationSeverity,
  OfficialRule,
  User,
  VerifiedStatus,
  VerificationResult,
  NewAIVerification,
  isSuccessfulVerification,
} from "./models";
import {
  createAcsChatThread,
  getAcsMessage,
  listAcsMessages,
} from "./acs";

interface GeneralChatStore {
  users: Record<string, User>;
  rules: OfficialRule[];
}

type WithId<T> = T & { id: string };

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
    rules: seedRules(),
  };
}

const globalStore = (globalThis as any).__generalChatStore || initStore();
if (!(globalThis as any).__generalChatStore) {
  (globalThis as any).__generalChatStore = globalStore;
}

export const store: GeneralChatStore = globalStore;

async function getContainer(id: string, partitionKey: string): Promise<Container> {
  const { container } = await database.containers.createIfNotExists({
    id,
    partitionKey: { paths: [partitionKey] },
  });
  return container;
}

const threadsContainerPromise = getContainer("chatThreads", "/threadId");
const messagesContainerPromise = getContainer("chatMessages", "/threadId");
const verificationsContainerPromise = getContainer(
  "chatVerifications",
  "/messageId"
);
const moderationContainerPromise = getContainer("chatModeration", "/messageId");

function stripCosmosFields<T>(item: WithId<T>): T {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...rest } = item;
  return rest;
}

export function upsertUser(user: User) {
  store.users[user.userId] = user;
  return store.users[user.userId];
}

async function getThread(threadId: string): Promise<ChatThread | undefined> {
  const container = await threadsContainerPromise;
  try {
    const { resource } = await container
      .item(threadId, threadId)
      .read<WithId<ChatThread>>();
    if (!resource) return undefined;
    return stripCosmosFields(resource);
  } catch (error: any) {
    if (error.code === 404) return undefined;
    throw error;
  }
}

async function updateMessageVerificationStatus(
  threadId: string,
  messageId: string,
  verifiedStatus: VerifiedStatus
) {
  const container = await messagesContainerPromise;
  const { resource } = await container
    .item(messageId, threadId)
    .read<WithId<ChatMessageMetadata>>();

  if (!resource) return;

  const next: WithId<ChatMessageMetadata> = {
    ...resource,
    verifiedStatus,
  };

  await container.item(messageId, threadId).replace(next);
}

export async function getOrCreateThread(
  schoolId: string,
  createdBy: string,
  creatorAcsUserId?: string
): Promise<AugmentedThread> {
  const container = await threadsContainerPromise;

  const { resources } = await container.items
    .query<WithId<ChatThread>>({
      query:
        "SELECT * FROM c WHERE c.schoolId = @schoolId AND c.isActive = true ORDER BY c.createdAt DESC",
      parameters: [{ name: "@schoolId", value: schoolId }],
    })
    .fetchAll();

  const existing = resources[0];

  let threadRecord: WithId<ChatThread>;

  if (existing) {
    threadRecord = existing;
  } else {
    const now = new Date().toISOString();
    const threadId = creatorAcsUserId
      ? await createAcsChatThread({
          topic: `School chat for ${schoolId}`,
          creatorAcsUserId,
        })
      : crypto.randomUUID();

    threadRecord = {
      id: threadId,
      threadId,
      schoolId,
      createdAt: now,
      createdBy,
      isActive: true,
    };

    await container.items.create(threadRecord);
  }

  return augmentThread(threadRecord.threadId);
}

export async function augmentThread(threadId: string): Promise<AugmentedThread> {
  const thread = await getThread(threadId);
  if (!thread) {
    throw new Error("Thread not found");
  }

  const messagesContainer = await messagesContainerPromise;
  const { resources: messageResources } = await messagesContainer.items
    .query<WithId<ChatMessageMetadata>>({
      query:
        "SELECT * FROM c WHERE c.threadId = @threadId ORDER BY c.createdAt",
      parameters: [{ name: "@threadId", value: threadId }],
    })
    .fetchAll();

  const metadata = messageResources.map(stripCosmosFields);
  const messageIds = metadata.map((m) => m.messageId);

  const acsReader =
    store.users[thread.createdBy]?.acsUserId ||
    Object.values(store.users).find((u) => u.schoolId === thread.schoolId)
      ?.acsUserId;
  let acsMessages: Awaited<ReturnType<typeof listAcsMessages>> = [];
  if (acsReader) {
    try {
      acsMessages = await listAcsMessages(thread.threadId, acsReader);
    } catch (error) {
      console.error("Failed to load ACS messages for thread", error);
    }
  }
  const acsMap = new Map(acsMessages.map((m) => [m.id, m]));

  const messages: ChatMessage[] = metadata.map((meta) => {
    const acs = acsMap.get(meta.messageId);
    return {
      ...meta,
      content: acs?.content?.message ?? "",
      senderId:
        meta.senderId ||
        acs?.senderCommunicationIdentifier?.communicationUserId ||
        "unknown",
      createdAt: acs?.createdOn ?? meta.createdAt,
    };
  });

  const users = Object.values(store.users).filter(
    (u) => u.schoolId === thread.schoolId
  );

  const officialRules = store.rules.filter(
    (rule) => rule.schoolId === thread.schoolId
  );

  const verifications = await listVerifications(messageIds);
  const moderationFlags = await listModerationFlags(messageIds);

  return {
    ...thread,
    messages,
    users,
    officialRules,
    verifications,
    moderationFlags,
  };
}

export async function addMessage(
  message: Omit<ChatMessageMetadata, "messageId">
): Promise<ChatMessageMetadata> {
  const messageId = crypto.randomUUID();
  const container = await messagesContainerPromise;

  const next: WithId<ChatMessageMetadata> = {
    ...message,
    id: messageId,
    messageId,
  };

  await container.items.create(next);
  return stripCosmosFields(next);
}

export async function findMessage(
  messageId: string
): Promise<ChatMessage | undefined> {
  const container = await messagesContainerPromise;
  const { resources } = await container.items
    .query<WithId<ChatMessageMetadata>>({
      query: "SELECT * FROM c WHERE c.messageId = @messageId",
      parameters: [{ name: "@messageId", value: messageId }],
    })
    .fetchAll();

  const found = resources[0];
  if (!found) return undefined;

  const metadata = stripCosmosFields(found);
  const thread = await getThread(metadata.threadId);
  const acsReader =
    (metadata.senderId && store.users[metadata.senderId]?.acsUserId) ||
    (thread ? store.users[thread.createdBy]?.acsUserId : undefined) ||
    (thread
      ? Object.values(store.users).find((u) => u.schoolId === thread.schoolId)
          ?.acsUserId
      : undefined);

  let envelope: Awaited<ReturnType<typeof getAcsMessage>> | undefined;
  if (acsReader) {
    try {
      envelope = await getAcsMessage(
        metadata.threadId,
        metadata.messageId,
        acsReader
      );
    } catch (error) {
      console.error("Failed to fetch ACS message content", error);
    }
  }

  return {
    ...metadata,
    content: envelope?.content?.message ?? "",
    createdAt: envelope?.createdOn ?? metadata.createdAt,
    senderId:
      metadata.senderId ||
      envelope?.senderCommunicationIdentifier?.communicationUserId ||
      "unknown",
  };
}

export async function addVerification(
  verification: NewAIVerification,
  verifiedStatus?: ChatMessage["verifiedStatus"]
): Promise<AIVerification> {
  const verificationId = crypto.randomUUID();
  const container = await verificationsContainerPromise;

  const record: WithId<AIVerification> = {
    ...verification,
    id: verificationId,
    verificationId,
  };

  await container.items.create(record);

  if (verifiedStatus && isSuccessfulVerification(verification)) {
    const message = await findMessage(verification.messageId);
    if (message) {
      await updateMessageVerificationStatus(
        message.threadId,
        verification.messageId,
        verifiedStatus
      );
    }
  }

  return stripCosmosFields(record);
}

export async function addModerationFlag(
  flag: Omit<ModerationFlag, "flagId">
): Promise<ModerationFlag> {
  const flagId = crypto.randomUUID();
  const container = await moderationContainerPromise;

  const record: WithId<ModerationFlag> = {
    ...flag,
    id: flagId,
    flagId,
  };

  await container.items.create(record);
  return stripCosmosFields(record);
}

export async function listVerifications(
  messageIds: string[]
): Promise<AIVerification[]> {
  if (messageIds.length === 0) return [];

  const container = await verificationsContainerPromise;
  const { resources } = await container.items
    .query<WithId<AIVerification>>({
      query: "SELECT * FROM c WHERE ARRAY_CONTAINS(@messageIds, c.messageId)",
      parameters: [{ name: "@messageIds", value: messageIds }],
    })
    .fetchAll();

  return resources.map(stripCosmosFields);
}

export async function listModerationFlags(
  messageIds: string[]
): Promise<ModerationFlag[]> {
  if (messageIds.length === 0) return [];

  const container = await moderationContainerPromise;
  const { resources } = await container.items
    .query<WithId<ModerationFlag>>({
      query: "SELECT * FROM c WHERE ARRAY_CONTAINS(@messageIds, c.messageId)",
      parameters: [{ name: "@messageIds", value: messageIds }],
    })
    .fetchAll();

  return resources.map(stripCosmosFields);
}

export type ModerationFlagDetail = ModerationFlag & { message?: ChatMessage };
export type VerificationDetail = AIVerification & { message?: ChatMessage };

export async function listModerationFlagsBySeverity(
  severity: ModerationSeverity
): Promise<ModerationFlagDetail[]> {
  const container = await moderationContainerPromise;
  const { resources } = await container.items
    .query<WithId<ModerationFlag>>({
      query:
        "SELECT * FROM c WHERE c.severity = @severity ORDER BY c.createdAt DESC",
      parameters: [{ name: "@severity", value: severity }],
    })
    .fetchAll();

  const flags = resources.map(stripCosmosFields);
  const messages = await Promise.all(
    flags.map((flag) => findMessage(flag.messageId))
  );

  return flags.map((flag, index) => ({
    ...flag,
    message: messages[index],
  }));
}

export async function listVerificationsByResult(
  verificationResult: VerificationResult
): Promise<VerificationDetail[]> {
  const container = await verificationsContainerPromise;
  const { resources } = await container.items
    .query<WithId<AIVerification>>({
      query:
        "SELECT * FROM c WHERE c.verificationResult = @verificationResult ORDER BY c.createdAt DESC",
      parameters: [{ name: "@verificationResult", value: verificationResult }],
    })
    .fetchAll();

  const verifications = resources.map(stripCosmosFields);
  const messages = await Promise.all(
    verifications.map((verification) => findMessage(verification.messageId))
  );

  return verifications.map((verification, index) => ({
    ...verification,
    message: messages[index],
  }));
}

export function getOfficialRules(schoolId: string, language: string) {
  return store.rules.filter(
    (rule) => rule.schoolId === schoolId && rule.language === language
  );
}
