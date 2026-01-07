import { Container } from "@azure/cosmos";
import { getDatabase } from "./client";

export function getThreadsContainer(): Container {
  const containerName = process.env.COSMOS_CONTAINER_THREADS;
  if (!containerName) {
    throw new Error("COSMOS_CONTAINER_THREADS is not configured");
  }
  return getDatabase().container(containerName);
}

export function getMessagesContainer(): Container {
  const containerName = process.env.COSMOS_CONTAINER_MESSAGES;
  if (!containerName) {
    throw new Error("COSMOS_CONTAINER_MESSAGES is not configured");
  }
  return getDatabase().container(containerName);
}

export function getAiVerificationsContainer(): Container {
  const containerName = process.env.COSMOS_CONTAINER_AI_VERIFICATIONS;
  if (!containerName) {
    throw new Error("COSMOS_CONTAINER_AI_VERIFICATIONS is not configured");
  }
  return getDatabase().container(containerName);
}

export function getModerationFlagsContainer(): Container {
  const containerName = process.env.COSMOS_CONTAINER_MODERATION_FLAGS;
  if (!containerName) {
    throw new Error("COSMOS_CONTAINER_MODERATION_FLAGS is not configured");
  }
  return getDatabase().container(containerName);
}
