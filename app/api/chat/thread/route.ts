import { NextResponse } from "next/server";
import { augmentThread, getOrCreateThread, upsertUser } from "@/lib/general-chat/store";
import { User } from "@/lib/general-chat/models";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { schoolId, user } = body as { schoolId?: string; user?: User };
  if (!schoolId || !user) {
    return NextResponse.json(
      { error: "schoolId and user are required" },
      { status: 400 }
    );
  }

  try {
    upsertUser(user);
    const thread = await getOrCreateThread(schoolId, user.userId, user.acsUserId);
    return NextResponse.json({ thread });
  } catch (error: any) {
    console.error("Failed to get or create thread", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create thread" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  if (!threadId) {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }

  try {
    const thread = await augmentThread(threadId);
    return NextResponse.json({ thread });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
}
