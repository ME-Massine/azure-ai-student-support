interface SendOptions {
  threadId: string;
  content: string;
  senderAcsUserId: string;
}

interface SimulatedChatMessageEnvelope {
  id: string;
  type: "text";
  sequenceId: string;
  version: string;
  content: { message: string };
  senderCommunicationIdentifier: { communicationUserId: string };
  createdOn: string;
}

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

function requireField(value: string | undefined, fieldName: string) {
  if (!value || !value.trim()) {
    throw new AcsRestError(`${fieldName} is required for ACS transport.`);
  }

  if (value.length > 8000) {
    throw new AcsRestError(
      `${fieldName} exceeds ACS message size limits.`,
      413,
      "RequestEntityTooLarge"
    );
  }
}

function validateThreadId(threadId: string) {
  const uuidPattern =
    /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/;

  if (!uuidPattern.test(threadId)) {
    throw new AcsRestError(
      "Invalid ACS threadId format.",
      400,
      "InvalidArgument"
    );
  }
}

export async function sendAcsMessage(options: SendOptions) {
  requireField(options.threadId, "threadId");
  requireField(options.content, "content");
  requireField(options.senderAcsUserId, "senderAcsUserId");
  validateThreadId(options.threadId);

  const deliveredAt = new Date().toISOString();
  const messageId = crypto.randomUUID();
  const ACS_MODE = "simulated" as const;

  const envelope: SimulatedChatMessageEnvelope = {
    id: messageId,
    type: "text",
    sequenceId: Date.now().toString(),
    version: "0",
    content: { message: options.content.trim() },
    senderCommunicationIdentifier: {
      communicationUserId: options.senderAcsUserId,
    },
    createdOn: deliveredAt,
  };
  return {
    acsMessageId: messageId,
    deliveredAt,
    threadId: options.threadId,
    senderAcsUserId: options.senderAcsUserId,
    content: options.content.trim(),
    envelope,
    mode: ACS_MODE,
  };
}
