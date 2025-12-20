interface SendOptions {
  threadId: string;
  content: string;
  senderAcsUserId: string;
}

export async function sendAcsMessage(options: SendOptions) {
  // Placeholder for ACS transport. In production this would use @azure/communication-chat.
  // We still return a deterministic id so metadata can link to the transport envelope.
  return {
    acsMessageId: crypto.randomUUID(),
    deliveredAt: new Date().toISOString(),
    threadId: options.threadId,
    senderAcsUserId: options.senderAcsUserId,
    content: options.content,
  };
}
