import { parseConnectionString } from "@azure/communication-common";
import { CommunicationIdentityClient } from "@azure/communication-identity";

const CHAT_API_VERSION = "2024-10-15-preview";

/* =========================
   Errors
========================= */

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

/* =========================
   Types
========================= */

type Participant = {
  id: { communicationUserId: string };
  displayName?: string;
  shareHistoryTime?: string;
};

export type AcsMessage = {
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

/* =========================
   Configuration
========================= */

function isAcsConfigured(): boolean {
  return !!process.env.ACS_CONNECTION_STRING;
}

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

/* =========================
   Real ACS clients
========================= */

class ChatThreadClient {
  constructor(
    private endpoint: string,
    private token: string,
    private threadId: string
  ) {}

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url =
      `${this.endpoint}${path}` +
      (path.includes("?") ? "&" : "?") +
      `api-version=${CHAT_API_VERSION}`;

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
      return undefined as T;
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
    private endpoint: string,
    private token: string
  ) {}

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url =
      `${this.endpoint}${path}` +
      (path.includes("?") ? "&" : "?") +
      `api-version=${CHAT_API_VERSION}`;

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
      return undefined as T;
    }

    return (await res.json()) as T;
  }

  async createChatThread(topic: string, participants: Participant[]) {
    const body = {
      topic,
      participants,
      idempotencyToken: crypto.randomUUID(),
    };

    const response = await this.request<any>(
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

/* =========================
   Simulation store
========================= */

type SimulatedThread = {
  threadId: string;
};

function getSimulatedStore() {
  const g = globalThis as any;
  if (!g.__acsSimThreads) {
    g.__acsSimThreads = new Set<string>();
  }
  return g.__acsSimThreads as Set<string>;
}

/* =========================
   Public API
========================= */

export async function createAcsChatThread(options: {
  topic: string;
  creatorAcsUserId: string;
  participants?: Participant[];
}) {
  if (!isAcsConfigured()) {
    const id = crypto.randomUUID();
    getSimulatedStore().add(id);
    return id;
  }

  const participants: Participant[] = [
    {
      id: { communicationUserId: options.creatorAcsUserId },
      displayName: "Thread Owner",
      shareHistoryTime: new Date().toISOString(),
    },
    ...(options.participants ?? []),
  ];

  const client = await getChatClientForUser(options.creatorAcsUserId);
  return client.createChatThread(options.topic, participants);
}

export async function sendAcsMessage(options: SendOptions) {
  if (!isAcsConfigured()) {
    return {
      acsMessageId: crypto.randomUUID(),
      deliveredAt: new Date().toISOString(),
      threadId: options.threadId,
      senderAcsUserId: options.senderAcsUserId,
      content: options.content.trim(),
      mode: "simulated" as const,
    };
  }

  const client = await getChatClientForUser(options.senderAcsUserId);
  const threadClient = client.getChatThreadClient(options.threadId);

  const messageId = await threadClient.sendMessage(
    options.content,
    options.senderDisplayName
  );

  return {
    acsMessageId: messageId,
    deliveredAt: new Date().toISOString(),
    threadId: options.threadId,
    senderAcsUserId: options.senderAcsUserId,
    content: options.content.trim(),
    mode: "acs" as const,
  };
}

export async function listAcsMessages() {
  // ACS is transport-only. Content comes from Cosmos.
  return [];
}

export async function getAcsMessage() {
  // Never block UI on ACS message reads.
  return null;
}
