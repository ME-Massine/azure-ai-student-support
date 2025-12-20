import { NextResponse } from "next/server";
import { CommunicationIdentityClient } from "@azure/communication-identity";

const identityClient = new CommunicationIdentityClient(
  process.env.ACS_CONNECTION_STRING!
);

export async function POST() {
  try {
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
