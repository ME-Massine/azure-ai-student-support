import { database } from "./client";

export const threadsContainer =
  database.container(process.env.COSMOS_CONTAINER_THREADS!);

export const messagesContainer =
  database.container(process.env.COSMOS_CONTAINER_MESSAGES!);

export const aiVerificationsContainer =
  database.container(process.env.COSMOS_CONTAINER_AI_VERIFICATIONS!);

export const moderationFlagsContainer =
  database.container(process.env.COSMOS_CONTAINER_MODERATION_FLAGS!);
