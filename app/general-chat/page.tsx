"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import { AugmentedThread, ChatMessage, User } from "@/lib/general-chat/models";

const demoUser: User = {
  userId: "student-001",
  acsUserId: "8:acs:demo-student",
  role: "student",
  schoolId: "demo-school",
  language: "en",
};

function roleBadge(
  role: ChatMessage["senderRole"],
  messageType: ChatMessage["messageType"]
) {
  if (messageType === "ai_verification") return "AI verifier";
  if (messageType === "system_warning") return "System";
  if (role === "ai") return "AI";
  return role === "senior" ? "Senior" : "Student";
}

function verificationBadge(status: ChatMessage["verifiedStatus"]) {
  if (status === "verified") return "Verified";
  if (status === "partially_verified") return "Partially verified";
  if (status === "conflict") return "Conflict";
  return "Unverified";
}

function messageTone(message: ChatMessage) {
  if (message.messageType === "system_warning") return styles.warning;
  if (message.messageType === "ai_verification") return styles.ai;
  if (message.senderRole === "ai") return styles.ai;
  return message.senderRole === "senior" ? styles.senior : styles.student;
}

function messageTypeLabel(message: ChatMessage) {
  switch (message.messageType) {
    case "question":
      return "Question";
    case "student_answer":
      return "Student answer";
    case "ai_verification":
      return "AI verification";
    case "official_reference":
      return "Official reference";
    case "system_warning":
      return "System warning";
    default:
      return "Message";
  }
}

export default function GeneralChatPage() {
  const [thread, setThread] = useState<AugmentedThread | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function bootstrapThread() {
    try {
      const res = await fetch("/api/chat/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId: demoUser.schoolId, user: demoUser }),
      });

      if (!res.ok) {
        setStatus("Unable to start chat.");
        return;
      }

      const data = await res.json();
      setThread(data.thread);
    } catch (error) {
      console.error("Failed to bootstrap chat thread", error);
      setStatus("Unable to start chat. Check your connection and retry.");
    }
  }

  useEffect(() => {
    bootstrapThread();
  }, []);

  const officialRules = useMemo(() => thread?.officialRules ?? [], [thread]);

  async function refreshThread(threadId: string) {
    const res = await fetch(`/api/chat/thread?threadId=${threadId}`);
    if (res.ok) {
      const data = await res.json();
      setThread(data.thread);
    }
  }

  async function moderateMessage(messageId: string) {
    try {
      const res = await fetch("/api/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });

      if (res.ok && thread) {
        refreshThread(thread.threadId);
      } else {
        setStatus("Moderation check failed");
      }
    } catch (error) {
      console.error("Moderation request failed", error);
      setStatus("Moderation unavailable. Please try again.");
    }
  }

  async function handleSend() {
    if (!thread || !input.trim()) return;

    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: thread.schoolId,
          threadId: thread.threadId,
          user: demoUser,
          content: input.trim(),
          messageType: "student_answer",
        }),
      });

      if (!res.ok) {
        setStatus("Message failed to send.");
        return;
      }

      const data = await res.json();
      setThread(data.thread);
      setInput("");

      if (data.message?.messageId) {
        await moderateMessage(data.message.messageId);
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyWithAI(message: ChatMessage) {
    setStatus("Requesting verification…");
    try {
      const res = await fetch("/api/chat/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.messageId }),
      });

      if (!res.ok) {
        setStatus("Verification failed");
        return;
      }

      const data = await res.json();
      setThread(data.thread);
      setStatus("AI verification posted to the thread.");
    } catch (error) {
      console.error("Verification request failed", error);
      setStatus("Verification failed. Please check your connection.");
    }
  }

  const verificationsByMessage = useMemo(() => {
    const lookup: Record<string, string> = {};
    thread?.verifications.forEach((v) => {
      lookup[v.messageId] = v.verificationResult;
    });
    return lookup;
  }, [thread]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>
            Azure Communication Services · Cosmos metadata · AI verification
          </p>
          <h1 className={styles.title}>General Student Chat</h1>
          <p className={styles.subtitle}>
            Student-to-student messaging with AI verification and moderation metadata. Human messages stay immutable; AI posts as separate entries.
          </p>
        </div>
        <div className={styles.meta}>
          <span>School: {thread?.schoolId ?? demoUser.schoolId}</span>
          <span>Language: {demoUser.language.toUpperCase()}</span>
        </div>
      </header>

      <section className={styles.grid}>
        <div className={styles.chatPanel}>
          <div className={styles.banner}>
            <div>
              <strong>Transport:</strong> Azure Communication Services (simulated)
            </div>
            <div>
              <strong>Governance:</strong> Cosmos-style metadata store (in-memory prototype)
            </div>
          </div>

          <div className={styles.messages}>
            {thread?.messages.map((message) => (
              <div
                key={message.messageId}
                className={`${styles.message} ${messageTone(message)}`}
              >
                <div className={styles.messageHeader}>
                  <span className={styles.badge}>
                    {roleBadge(message.senderRole, message.messageType)}
                  </span>
                  <span className={styles.type}>{messageTypeLabel(message)}</span>
                  <span className={styles.status}>
                    {verificationBadge(message.verifiedStatus)}
                  </span>
                </div>
                <p className={styles.content}>{message.content}</p>
                <div className={styles.footer}>
                  <span>{new Date(message.createdAt).toLocaleString()}</span>
                  {verificationsByMessage[message.messageId] && (
                    <span className={styles.reference}>
                      AI result: {verificationsByMessage[message.messageId]}
                    </span>
                  )}
                </div>
                {message.messageType === "student_answer" && (
                  <div className={styles.actions}>
                    <button
                      onClick={() => verifyWithAI(message)}
                      className={styles.verifyBtn}
                    >
                      Verify with AI
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={styles.inputRow}>
            <textarea
              placeholder="Share guidance or answers for other students…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              disabled={loading}
            />
            <div className={styles.inputActions}>
              <button onClick={handleSend} disabled={!input.trim() || loading}>
                Send
              </button>
              {status && <span className={styles.statusText}>{status}</span>}
            </div>
          </div>
        </div>

        <aside className={styles.sidebar}>
          <h3>Official school rules</h3>
          <p className={styles.small}>
            AI references only these sources. Human answers never override official data.
          </p>
          <ul className={styles.ruleList}>
            {officialRules.map((rule) => (
              <li key={rule.ruleId}>
                <div className={styles.ruleTitle}>{rule.title}</div>
                <p className={styles.ruleContent}>{rule.content}</p>
                <span className={styles.ruleMeta}>Category: {rule.category}</span>
              </li>
            ))}
          </ul>
          <div className={styles.footerCard}>
            <strong>Moderation</strong>
            <p>
              Content Safety runs on every student message. Severe issues create system warnings; records remain auditable alongside AI verification history.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
