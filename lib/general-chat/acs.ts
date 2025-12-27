import { parseConnectionString } from "@azure/communication-common";
import { CommunicationIdentityClient } from "@azure/communication-identity";

const CHAT_API_VERSION = "2024-10-15-preview";

class AcsRestError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode = 400, code = "BadRequest") {
    super(message);
    this.name = "RestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

type Participant = {
  id: { communicationUserId: string };
  displayName?: string;
  shareHistoryTime?: string;
};

type AcsMessage = {
  id: string;
  type: string;
  content?: { message?: string };
  senderCommunicationIdentifier?: { communicationUserId?: string };
  createdOn?: string;
};

type SendOptions = {
  threadId: string;
  content: string;
  senderAcsUserId: string;
  senderDisplayName?: string;
};

let parsedConnection:
  | { endpoint: string; identityClient: CommunicationIdentityClient }
  | null = null;

function getConnection() {
  if (parsedConnection) return parsedConnection;

  const connectionString = process.env.ACS_CONNECTION_STRING;
  if (!connectionString) {
    throw new AcsRestError("ACS connection string not configured.", 503);
  }

  const { endpoint } = parseConnectionString(connectionString);
  parsedConnection = {
    endpoint: endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint,
    identityClient: new CommunicationIdentityClient(connectionString),
  };

  return parsedConnection;
}

async function getUserToken(acsUserId: string) {
  const { identityClient } = getConnection();
  const { token } = await identityClient.getToken(
    { communicationUserId: acsUserId },
    ["chat"]
  );
  return token;
}

class ChatThreadClient {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly threadId: string
  ) {}

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.endpoint}${path}${
      path.includes("?") ? "&" : "?"
    }api-version=${CHAT_API_VERSION}`;

    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(init.headers || {}),
      },
    });

    if (!res.ok) {
      const details = await res.text();
      throw new AcsRestError(
        `ACS request failed: ${res.status} ${res.statusText} ${details}`,
        res.status
      );
    }

    if (res.status === 204) {
      // @ts-expect-error - no body for 204
      return undefined;
    }

    return (await res.json()) as T;
  }

  async sendMessage(content: string, displayName?: string) {
    const body = {
      content: content.trim(),
      type: "text",
      senderDisplayName: displayName,
    };

    const response = await this.request<{ id: string }>(
      `/chat/threads/${this.threadId}/messages`,
      { method: "POST", body: JSON.stringify(body) }
    );

    return response.id;
  }

  async getMessage(messageId: string) {
    return this.request<AcsMessage>(
      `/chat/threads/${this.threadId}/messages/${messageId}`,
      { method: "GET" }
    );
  }

  async listMessages() {
    const response = await this.request<{ value: AcsMessage[] }>(
      `/chat/threads/${this.threadId}/messages?maxPageSize=50`,
      { method: "GET" }
    );
    return response.value;
  }
}

class ChatClient {
  constructor(
    private readonly endpoint: string,
    private readonly token: string
  ) {}

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.endpoint}${path}${
      path.includes("?") ? "&" : "?"
    }api-version=${CHAT_API_VERSION}`;

    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(init.headers || {}),
      },
    });

    if (!res.ok) {
      const details = await res.text();
      throw new AcsRestError(
        `ACS request failed: ${res.status} ${res.statusText} ${details}`,
        res.status
      );
    }

    if (res.status === 204) {
      // @ts-expect-error - no body for 204
      return undefined;
    }

    return (await res.json()) as T;
  }

  async createChatThread(topic: string, participants: Participant[]) {
    const body = {
      topic,
      participants,
      idempotencyToken: crypto.randomUUID(),
    };

    const response = await this.request<{
      chatThread?: { id?: string };
      id?: string;
      chatThreadId?: string;
    }>(
      "/chat/threads",
      { method: "POST", body: JSON.stringify(body) }
    );

    const threadId =
      response.chatThread?.id || response.id || response.chatThreadId;
    if (!threadId) {
      throw new AcsRestError("ACS did not return a thread id.", 502);
    }

    return threadId;
  }

  getChatThreadClient(threadId: string) {
    return new ChatThreadClient(this.endpoint, this.token, threadId);
  }
}

async function getChatClientForUser(acsUserId: string) {
  const { endpoint } = getConnection();
  const token = await getUserToken(acsUserId);
  return new ChatClient(endpoint, token);
}

export async function createAcsChatThread(options: {
  topic: string;
  creatorAcsUserId: string;
  participants?: Participant[];
}) {
  const participants: Participant[] = [
    {
      id: { communicationUserId: options.creatorAcsUserId },
      displayName: "Thread Owner",
      shareHistoryTime: new Date().toISOString(),
    },
    ...(options.participants ?? []),
  ];

  const client = await getChatClientForUser(options.creatorAcsUserId);
  const threadId = await client.createChatThread(options.topic, participants);
  return threadId;
}

export async function sendAcsMessage(options: SendOptions) {
  if (!options.threadId || !options.content || !options.senderAcsUserId) {
    throw new AcsRestError("threadId, content, and senderAcsUserId are required.");
  }

  const client = await getChatClientForUser(options.senderAcsUserId);
  const threadClient = client.getChatThreadClient(options.threadId);

  const messageId = await threadClient.sendMessage(
    options.content,
    options.senderDisplayName
  );
  const envelope = await threadClient.getMessage(messageId);

  const deliveredAt =
    envelope.createdOn ?? new Date().toISOString();

  return {
    acsMessageId: messageId,
    deliveredAt,
    threadId: options.threadId,
    senderAcsUserId: options.senderAcsUserId,
    content: options.content.trim(),
    envelope,
    mode: "chatClient" as const,
  };
}

export async function listAcsMessages(threadId: string, acsUserId: string) {
  if (!threadId || !acsUserId) {
    throw new AcsRestError("threadId and acsUserId are required to list messages.");
  }

  const client = await getChatClientForUser(acsUserId);
  const threadClient = client.getChatThreadClient(threadId);
  return threadClient.listMessages();
}

export async function getAcsMessage(
  threadId: string,
  messageId: string,
  acsUserId: string
) {
  if (!threadId || !messageId || !acsUserId) {
    throw new AcsRestError("threadId, messageId, and acsUserId are required.");
  }
  const client = await getChatClientForUser(acsUserId);
  const threadClient = client.getChatThreadClient(threadId);
  return threadClient.getMessage(messageId);
}
