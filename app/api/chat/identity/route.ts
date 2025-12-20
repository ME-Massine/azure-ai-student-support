import { NextResponse } from "next/server";
import { CommunicationIdentityClient } from "@azure/communication-identity";

export async function POST() {
  try {
    const connectionString = process.env.ACS_CONNECTION_STRING;

    if (!connectionString) {
      return NextResponse.json(
        { error: "ACS connection string not configured" },
        { status: 503 }
      );
    }

    const identityClient = new CommunicationIdentityClient(connectionString);

    const user = await identityClient.createUser();
    const token = await identityClient.getToken(user, ["chat"]);

    return NextResponse.json({
      acsUserId: user.communicationUserId,
      token: token.token,
      expiresOn: token.expiresOn,
    });
  } catch (error) {
    console.error("ACS identity creation failed:", error);
    return NextResponse.json(
      { error: "Failed to create ACS identity" },
      { status: 500 }
    );
  }
}
