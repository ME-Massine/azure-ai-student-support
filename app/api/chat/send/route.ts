import { NextResponse } from "next/server";
import { sendAcsMessage } from "@/lib/general-chat/acs";
import {
  addMessage,
  augmentThread,
  getOrCreateThread,
  upsertUser,
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

  let thread: ReturnType<typeof augmentThread>;
  try {
    thread = threadId
      ? augmentThread(threadId)
      : getOrCreateThread(schoolId, user.userId);
  } catch (error) {
    console.error("Invalid thread reference", error);
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  upsertUser(user);

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

const safety = await analyzeTextSafety(content);

if (safety.blocked) {
  return NextResponse.json(
    {
      error: "Message blocked due to safety policy",
      categories: safety.categories,
    },
    { status: 403 }
  );
}

  const created = addMessage({
    threadId: thread.threadId,
    senderId: user.userId,
    senderRole: user.role === "senior" ? "senior" : "student",
    content: acsResult.content,
    createdAt: acsResult.deliveredAt,
    messageType: messageType ?? "student_answer",
    verifiedStatus: "unverified",
  });

  return NextResponse.json({
    message: created,
    thread: augmentThread(thread.threadId),
  });
}
