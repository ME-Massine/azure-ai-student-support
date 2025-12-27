import { NextResponse } from "next/server";
import { sendAcsMessage } from "@/lib/general-chat/acs";
import {
  addMessage,
  augmentThread,
  getOrCreateThread,
  upsertUser,
  addModerationFlag,
} from "@/lib/general-chat/store";
import { ChatMessage, User } from "@/lib/general-chat/models";
import { analyzeTextSafety } from "@/lib/content-safety/client";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { schoolId, threadId, user, content, messageType } = body as {
    schoolId?: string;
    threadId?: string;
    user?: User;
    content?: string;
    messageType?: ChatMessage["messageType"];
  };

  if (!user || !schoolId || !content) {
    return NextResponse.json(
      { error: "user, schoolId, and content are required" },
      { status: 400 }
    );
  }

  let thread: Awaited<ReturnType<typeof augmentThread>>;
  try {
    thread = threadId
      ? await augmentThread(threadId)
      : await getOrCreateThread(schoolId, user.userId, user.acsUserId);
  } catch (error) {
    console.error("Invalid thread reference", error);
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  upsertUser(user);

  const safetyCheckedAt = new Date().toISOString();
  const safety = await analyzeTextSafety(content);
  const safetyMetadata = {
    source: "azure_content_safety",
    categories: safety.categories,
    blocked: safety.blocked,
    createdAt: safetyCheckedAt,
  };

  if (safety.blocked) {
    const systemAcsMessage = await sendAcsMessage({
      threadId: thread.threadId,
      content: "This message could not be posted due to school safety policy.",
      senderAcsUserId: user.acsUserId,
      senderDisplayName: "System",
    });

    const systemMessage = await addMessage({
      threadId: thread.threadId,
      senderId: "system-content-safety",
      senderRole: "ai",
      createdAt: systemAcsMessage.deliveredAt ?? safetyCheckedAt,
      messageType: "system_warning",
      verifiedStatus: "unverified",
    });

    const moderation = await addModerationFlag({
      messageId: systemMessage.messageId,
      severity: "high",
      reason: "Azure Content Safety blocked a student message.",
      createdAt: safetyCheckedAt,
      actionTaken: "warning_posted",
      metadata: safetyMetadata,
    });

    return NextResponse.json(
      {
        blocked: true,
        moderation,
        systemMessage,
        thread: await augmentThread(thread.threadId),
      },
      { status: 200 }
    );
  }

  let acsResult: Awaited<ReturnType<typeof sendAcsMessage>>;
  try {
    acsResult = await sendAcsMessage({
      threadId: thread.threadId,
      content,
      senderAcsUserId: user.acsUserId,
    });
  } catch (error) {
    console.error("ACS transport failed", error);

    const status = (error as any)?.statusCode ?? 502;
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to send message through ACS.";

    return NextResponse.json({ error: message }, { status });
  }

  const created = await addMessage({
    threadId: thread.threadId,
    senderId: user.userId,
    senderRole: user.role === "senior" ? "senior" : "student",
    createdAt: acsResult.deliveredAt,
    messageType: messageType ?? "student_answer",
    verifiedStatus: "unverified",
  });

  await addModerationFlag({
    messageId: created.messageId,
    severity: "low",
    reason: "Azure Content Safety scan completed.",
    createdAt: safetyCheckedAt,
    actionTaken: "none",
    metadata: safetyMetadata,
  });

  return NextResponse.json({
    message: created,
    thread: await augmentThread(thread.threadId),
  });
}
