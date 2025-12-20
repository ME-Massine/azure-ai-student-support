"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import {
  AugmentedThread,
  ChatMessage,
  ModerationFlag,
  User,
} from "@/lib/general-chat/models";

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

function moderationBadge(severity: ModerationFlag["severity"]) {
  if (severity === "high") return "High risk";
  if (severity === "medium") return "Needs review";
  return "Low risk";
}

export default function GeneralChatPage() {
  const [thread, setThread] = useState<AugmentedThread | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "rules" | "verification" | "moderation"
  >("rules");
  const [expandedMessages, setExpandedMessages] = useState<
    Record<string, boolean>
  >({});

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

  useEffect(() => {
    if (thread?.messages.length && !selectedMessageId) {
      setSelectedMessageId(thread.messages[thread.messages.length - 1].messageId);
    }
  }, [selectedMessageId, thread]);

  const officialRules = useMemo(() => thread?.officialRules ?? [], [thread]);

  const moderationFlags = useMemo(
    () => thread?.moderationFlags ?? [],
    [thread]
  );

  const highRisk = useMemo(
    () => moderationFlags.some((flag) => flag.severity === "high"),
    [moderationFlags]
  );

  const studentMessages = useMemo(
    () =>
      thread?.messages.filter((m) => m.messageType === "student_answer") ?? [],
    [thread]
  );

  const verifiedMessages = useMemo(
    () => studentMessages.filter((m) => m.verifiedStatus !== "unverified"),
    [studentMessages]
  );

  const verificationCoverage = useMemo(() => {
    if (studentMessages.length === 0) return 0;
    return Math.round((verifiedMessages.length / studentMessages.length) * 100);
  }, [studentMessages, verifiedMessages]);

  const moderationByMessage = useMemo(() => {
    const lookup: Record<string, ModerationFlag[]> = {};
    moderationFlags.forEach((flag) => {
      lookup[flag.messageId] = lookup[flag.messageId] || [];
      lookup[flag.messageId].push(flag);
    });
    return lookup;
  }, [moderationFlags]);

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

  const officialSourcesByMessage = useMemo(() => {
    const lookup: Record<string, string[]> = {};
    thread?.verifications.forEach((v) => {
      lookup[v.messageId] = v.officialSourceIds;
    });
    return lookup;
  }, [thread]);

  function toggleDetails(messageId: string) {
    setExpandedMessages((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
    setSelectedMessageId(messageId);
  }

  function statusChip(message: ChatMessage) {
    const moderation = moderationByMessage[message.messageId]?.[0];
    if (moderation) return moderationBadge(moderation.severity);
    if (message.verifiedStatus !== "unverified")
      return verificationBadge(message.verifiedStatus);
    if (message.messageType === "student_answer") return "Pending";
    return null;
  }

  function roleIcon(role: ChatMessage["senderRole"], type: ChatMessage["messageType"]) {
    if (type === "ai_verification") return "✓";
    if (type === "system_warning") return "!";
    if (role === "senior") return "★";
    if (role === "ai") return "🤖";
    return "👤";
  }

  const selectedMessage = useMemo(() => {
    if (!thread?.messages.length) return undefined;
    if (selectedMessageId) {
      return (
        thread.messages.find((m) => m.messageId === selectedMessageId) ||
        thread.messages[thread.messages.length - 1]
      );
    }
    return thread.messages[thread.messages.length - 1];
  }, [selectedMessageId, thread]);

  return (
    <main className={styles.shell}>
      <nav className="global-nav">
        <Link className="nav-tab" href="/">
          AI Student Support
        </Link>
        <Link className="nav-tab active" href="/general-chat">
          Student Chat (ACS)
        </Link>
      </nav>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>
            Azure Communication Services · Cosmos metadata · AI verification
          </p>
          <h1 className={styles.title}>General Student Chat</h1>
          <p className={styles.subtitle}>
            Student-to-student messaging with AI verification and moderation
            metadata. Human messages stay immutable; AI posts as separate
            entries.
          </p>
        </div>
        <div className={styles.meta}>
          <span>School: {thread?.schoolId ?? demoUser.schoolId}</span>
          <span>Language: {demoUser.language.toUpperCase()}</span>
        </div>
      </header>

      <section className={styles.summaryBar}>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Verified answers</div>
          <div className={styles.summaryValue}>{verificationCoverage}%</div>
          <p className={styles.summaryMeta}>
            {verifiedMessages.length} verified ·
            {" "}
            {studentMessages.length - verifiedMessages.length} pending
          </p>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Moderation status</div>
          <div className={styles.summaryValue}>
            {highRisk
              ? "High risk"
              : moderationFlags.length > 0
              ? "Warnings present"
              : "Clear"}
          </div>
          <p className={styles.summaryMeta}>
            {moderationFlags.length} moderation flag
            {moderationFlags.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Audit completeness</div>
          <div className={styles.summaryValue}>
            {(thread?.verifications.length ?? 0) + studentMessages.length > 0
              ? Math.min(
                  100,
                  Math.round(
                    ((thread?.verifications.length ?? 0) /
                      (studentMessages.length || 1)) *
                      100
                  )
                )
              : 0}
            %
          </div>
          <p className={styles.summaryMeta}>
            {(thread?.verifications.length ?? 0)} AI verification record
            {(thread?.verifications.length ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
      </section>

      <section className={styles.grid}>
        <div className={styles.chatPanel}>
          {highRisk && (
            <div className={styles.threadBanner}>
              High-risk content detected. Review flagged messages below before
              sharing externally.
            </div>
          )}

          <div className={styles.messages}>
            {thread?.messages.map((message) => {
              const isExpanded = expandedMessages[message.messageId];
              const moderation = moderationByMessage[message.messageId]?.[0];
              const chip = statusChip(message);
              const verification = verificationsByMessage[message.messageId];

              return (
                <article
                  key={message.messageId}
                  className={styles.message}
                  onClick={() => toggleDetails(message.messageId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      toggleDetails(message.messageId);
                    }
                  }}
                >
                  <div className={styles.messageHeader}>
                    <span className={styles.roleIcon}>
                      {roleIcon(message.senderRole, message.messageType)}
                    </span>
                    <span className={styles.sender}>
                      {roleBadge(message.senderRole, message.messageType)}
                    </span>
                    {chip && <span className={styles.status}>{chip}</span>}
                    {moderation?.severity === "medium" && (
                      <span className={`${styles.status} ${styles.inlineWarn}`}>
                        Needs review
                      </span>
                    )}
                    {moderation?.severity === "low" && (
                      <span className={styles.iconOnly} title="Low risk">
                        ●
                      </span>
                    )}
                    <button
                      className={styles.chevron}
                      aria-label={isExpanded ? "Collapse details" : "Expand details"}
                    >
                      {isExpanded ? "▾" : "▸"}
                    </button>
                  </div>

                  <p className={styles.content}>{message.content}</p>

                  {verification && (
                    <div className={styles.verificationNote}>
                      <span className={styles.noteLabel}>
                        AI verification (non-binding)
                      </span>
                      <p className={styles.noteBody}>{verification}</p>
                    </div>
                  )}

                  {isExpanded && (
                    <div className={styles.detailsPanel}>
                      <div className={styles.detailRow}>
                        <div className={styles.detailLabel}>Verification</div>
                        <div className={styles.detailBody}>
                          {verification ? verification : "Not yet requested"}
                        </div>
                      </div>
                      <div className={styles.detailRow}>
                        <div className={styles.detailLabel}>Moderation</div>
                        <div className={styles.detailBody}>
                          {moderation
                            ? `${moderationBadge(moderation.severity)} · ${moderation.reason}`
                            : "No issues detected"}
                        </div>
                      </div>
                      <div className={styles.detailRow}>
                        <div className={styles.detailLabel}>Official sources</div>
                        <div className={styles.detailBody}>
                          {officialSourcesByMessage[message.messageId]?.length
                            ? officialSourcesByMessage[message.messageId].join(
                                ", "
                              )
                            : "None referenced"}
                        </div>
                      </div>
                      <div className={styles.detailRow}>
                        <div className={styles.detailLabel}>Timestamp</div>
                        <div className={styles.detailBody}>
                          {new Date(message.createdAt).toLocaleString()}
                        </div>
                      </div>
                      {message.messageType === "student_answer" && (
                        <div className={styles.detailActions}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              verifyWithAI(message);
                            }}
                            className={styles.verifyBtn}
                          >
                            Verify with AI
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
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
          <div className={styles.tabList}>
            {(["rules", "verification", "moderation"] as const).map((tab) => (
              <button
                key={tab}
                className={`${styles.tab} ${
                  activeTab === tab ? styles.activeTab : ""
                } ${
                  selectedMessageId === null && tab !== "rules"
                    ? styles.tabDisabled
                    : ""
                }`}
                disabled={selectedMessageId === null && tab !== "rules"}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "rules"
                  ? "Official Rules"
                  : tab === "verification"
                  ? "Verification Summary"
                  : "Moderation Log"}
              </button>
            ))}
          </div>

          <div className={styles.sidebarPanel}>
            {activeTab === "rules" && (
              <div className={styles.sidebarSection}>
                <h3>Official Rules</h3>
                <p className={styles.small}>
                  AI references only these sources. Human answers remain
                  immutable.
                </p>
                <ul className={styles.ruleList}>
                  {officialRules.map((rule) => (
                    <li key={rule.ruleId}>
                      <div className={styles.ruleTitle}>{rule.title}</div>
                      <p className={styles.ruleContent}>{rule.content}</p>
                      <span className={styles.ruleMeta}>
                        Category: {rule.category}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeTab === "verification" && (
              <div className={styles.sidebarSection}>
                <h3>Verification Summary</h3>
                <p className={styles.small}>
                  Selected message: {selectedMessage?.messageId ?? "none"}
                </p>
                <p className={styles.sidebarBody}>
                  {selectedMessage?.messageId &&
                  verificationsByMessage[selectedMessage.messageId]
                    ? verificationsByMessage[selectedMessage.messageId]
                    : "No AI verification yet."}
                </p>
                <p className={styles.sidebarMeta}>
                  Sources: {selectedMessage?.messageId &&
                  officialSourcesByMessage[selectedMessage.messageId]?.length
                    ? officialSourcesByMessage[selectedMessage.messageId]?.join(
                        ", "
                      )
                    : "n/a"}
                </p>
              </div>
            )}

            {activeTab === "moderation" && (
              <div className={styles.sidebarSection}>
                <h3>Moderation Log</h3>
                <ul className={styles.flagListCompact}>
                  {moderationFlags.map((flag) => (
                    <li key={flag.flagId}>
                      <span
                        className={`${styles.flagPill} ${styles[flag.severity]}`}
                      >
                        {moderationBadge(flag.severity)}
                      </span>
                      <div>
                        <div className={styles.flagReason}>{flag.reason}</div>
                        <div className={styles.flagMeta}>
                          Message: {flag.messageId}
                        </div>
                      </div>
                    </li>
                  ))}
                  {moderationFlags.length === 0 && (
                    <li className={styles.flagItemMuted}>No moderation events.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
