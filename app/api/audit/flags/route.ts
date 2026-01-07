import { NextResponse } from "next/server";

import { listModerationFlagsBySeverity } from "@/lib/general-chat/store";
import type { ModerationFlagDetail } from "@/lib/general-chat/store";
import type { ModerationSeverity } from "@/lib/general-chat/models";

export const dynamic = 'force-dynamic';

const VALID_SEVERITIES: ModerationSeverity[] = ["low", "medium", "high"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const severity = (searchParams.get("severity") ?? "high") as ModerationSeverity;

  if (!VALID_SEVERITIES.includes(severity)) {
    return NextResponse.json(
      { error: "Invalid severity. Use low, medium, or high." },
      { status: 400 }
    );
  }

  try {
    const flags: ModerationFlagDetail[] = await listModerationFlagsBySeverity(
      severity
    );
    return NextResponse.json({ flags });
  } catch (error) {
    console.error("Failed to load audit moderation flags", error);
    return NextResponse.json(
      { error: "Unable to load moderation flags." },
      { status: 500 }
    );
  }
}
