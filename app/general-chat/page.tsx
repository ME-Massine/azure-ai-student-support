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

function statusChip(
  message: ChatMessage,
  moderation?: ModerationFlag
): string | null {
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
      <ChatHeader
        schoolId={thread?.schoolId ?? demoUser.schoolId}
        language={demoUser.language}
      />

      <ThreadStatusBar
        verificationCoverage={verificationCoverage}
        verifiedCount={verifiedMessages.length}
        pendingCount={studentMessages.length - verifiedMessages.length}
        moderationFlags={moderationFlags}
        auditRecords={thread?.verifications.length ?? 0}
      />

      <section className={styles.grid}>
        <div className={styles.chatColumn}>
          {highRisk && (
            <div className={styles.threadBanner}>
              High-risk content detected. Review flagged messages before sharing
              externally.
            </div>
          )}

          <ChatTimeline
            messages={thread?.messages ?? []}
            expandedMessages={expandedMessages}
            selectedMessageId={selectedMessageId}
            onToggleDetails={(messageId) => toggleDetails(messageId)}
            onSelectMessage={(messageId) => setSelectedMessageId(messageId)}
            verificationsByMessage={verificationsByMessage}
            moderationByMessage={moderationByMessage}
            officialSourcesByMessage={officialSourcesByMessage}
            onVerify={verifyWithAI}
          />

          <MessageComposer
            value={input}
            onChange={setInput}
            onSend={handleSend}
            loading={loading}
            status={status}
          />
        </div>

        <ContextSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          disableDataTabs={!selectedMessageId}
          selectedMessage={selectedMessage}
          moderationFlags={moderationFlags}
          verificationsByMessage={verificationsByMessage}
          officialSourcesByMessage={officialSourcesByMessage}
          officialRules={officialRules}
        />
      </section>
    </main>
  );
}

type ChatHeaderProps = {
  schoolId: string;
  language: string;
};

function ChatHeader({ schoolId, language }: ChatHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.kicker}>Azure Communication Services · Cosmos metadata</p>
        <h1 className={styles.title}>General Student Chat</h1>
        <p className={styles.subtitle}>
          Peer chat with AI verification and moderation context—human messages stay
          immutable while AI posts as separate entries.
        </p>
      </div>
      <div className={styles.meta}>
        <span>School: {schoolId}</span>
        <span>Language: {language.toUpperCase()}</span>
      </div>
    </header>
  );
}

type ThreadStatusBarProps = {
  verificationCoverage: number;
  verifiedCount: number;
  pendingCount: number;
  moderationFlags: ModerationFlag[];
  auditRecords: number;
};

function ThreadStatusBar({
  verificationCoverage,
  verifiedCount,
  pendingCount,
  moderationFlags,
  auditRecords,
}: ThreadStatusBarProps) {
  const highRisk = moderationFlags.some((flag) => flag.severity === "high");
  const moderationSummary =
    moderationFlags.length === 0
      ? "Clear"
      : highRisk
      ? "High risk"
      : "Warnings present";

  // Inline summary keeps governance signals visible without pulling focus from the chat.
  return (
    <div className={styles.statusBar}>
      <span className={styles.statusPill}>
        Verified: {verificationCoverage}% ({verifiedCount} of{" "}
        {verifiedCount + pendingCount})
      </span>
      <span className={styles.dividerDot}>•</span>
      <span className={styles.statusPill}>Moderation: {moderationSummary}</span>
      <span className={styles.dividerDot}>•</span>
      <span className={styles.statusPill}>
        Audit: {auditRecords} record{auditRecords === 1 ? "" : "s"}
      </span>
    </div>
  );
}

type ChatTimelineProps = {
  messages: ChatMessage[];
  expandedMessages: Record<string, boolean>;
  selectedMessageId: string | null;
  onToggleDetails: (messageId: string) => void;
  onSelectMessage: (messageId: string) => void;
  verificationsByMessage: Record<string, string>;
  moderationByMessage: Record<string, ModerationFlag[]>;
  officialSourcesByMessage: Record<string, string[]>;
  onVerify: (message: ChatMessage) => void;
};

function ChatTimeline({
  messages,
  expandedMessages,
  selectedMessageId,
  onToggleDetails,
  onSelectMessage,
  verificationsByMessage,
  moderationByMessage,
  officialSourcesByMessage,
  onVerify,
}: ChatTimelineProps) {
  if (!messages.length) {
    return <EmptyChatState />;
  }

  // Timeline-first rendering keeps messages primary while allowing deeper review on demand.
  return (
    <div className={styles.messages}>
      {messages.map((message) => {
        const isExpanded = expandedMessages[message.messageId];
        const moderation = moderationByMessage[message.messageId]?.[0];
        const chip = statusChip(message, moderation);
        const verification = verificationsByMessage[message.messageId];
        const isSelected = selectedMessageId === message.messageId;
        const isStudent = message.senderRole === "student";

        return (
          <article
            key={message.messageId}
            className={`${styles.message} ${isSelected ? styles.messageSelected : ""} ${
              isStudent ? styles.myMessage : styles.otherMessage
            }`}
            onClick={() => {
              onToggleDetails(message.messageId);
              onSelectMessage(message.messageId);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onToggleDetails(message.messageId);
                onSelectMessage(message.messageId);
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
              <span className={styles.timestamp}>
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
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

            <div className={styles.messageFoot}>
              <span className={styles.roleTag}>
                {message.senderRole === "student" ? "Human" : "AI"}
              </span>
              {verification && (
                <span className={styles.footNote}>AI verification noted</span>
              )}
              {moderation && (
                <span className={styles.footNote}>
                  {moderationBadge(moderation.severity)}
                </span>
              )}
            </div>

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
                      ? officialSourcesByMessage[message.messageId].join(", ")
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
                        onVerify(message);
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
  );
}

function EmptyChatState() {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyBadge}>Chat ready</div>
      <p className={styles.emptyTitle}>No messages yet.</p>
      <p className={styles.emptyBody}>
        Start a conversation. AI verification appears after posting.
      </p>
    </div>
  );
}

type MessageComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  loading: boolean;
  status: string | null;
};

function MessageComposer({
  value,
  onChange,
  onSend,
  loading,
  status,
}: MessageComposerProps) {
  return (
    <div className={styles.inputRow}>
      <label className={styles.visuallyHidden} htmlFor="composer">
        Message composer
      </label>
      <textarea
        id="composer"
        placeholder="Type a message for classmates…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        disabled={loading}
      />
      <div className={styles.inputActions}>
        <button onClick={onSend} disabled={!value.trim() || loading}>
          Send
        </button>
        {status && <span className={styles.statusText}>{status}</span>}
      </div>
    </div>
  );
}

type ContextSidebarProps = {
  activeTab: "rules" | "verification" | "moderation";
  onTabChange: (tab: "rules" | "verification" | "moderation") => void;
  disableDataTabs: boolean;
  selectedMessage?: ChatMessage;
  moderationFlags: ModerationFlag[];
  verificationsByMessage: Record<string, string>;
  officialSourcesByMessage: Record<string, string[]>;
  officialRules: AugmentedThread["officialRules"];
};

function ContextSidebar({
  activeTab,
  onTabChange,
  disableDataTabs,
  selectedMessage,
  moderationFlags,
  verificationsByMessage,
  officialSourcesByMessage,
  officialRules,
}: ContextSidebarProps) {
  const verificationText =
    selectedMessage?.messageId &&
    verificationsByMessage[selectedMessage.messageId];
  const verificationSources =
    selectedMessage?.messageId &&
    officialSourcesByMessage[selectedMessage.messageId]?.length
      ? officialSourcesByMessage[selectedMessage.messageId]?.join(", ")
      : "n/a";

  // Context panel stays lighter-weight so it supports the chat without competing with it.
  return (
    <aside className={styles.sidebar}>
      <SidebarTabs
        activeTab={activeTab}
        onTabChange={onTabChange}
        disableDataTabs={disableDataTabs}
      />

      <div className={styles.sidebarPanel}>
        {activeTab === "rules" && <OfficialRulesPanel rules={officialRules} />}

        {activeTab === "verification" && (
          <div className={styles.sidebarSection}>
            <div className={styles.sidebarHeader}>
              <h3>Verification summary</h3>
              <span className={styles.sidebarPill}>
                {selectedMessage?.messageId ?? "No selection"}
              </span>
            </div>
            <p className={styles.sidebarBody}>
              {verificationText ?? "No AI verification yet."}
            </p>
            <p className={styles.sidebarMeta}>Sources: {verificationSources}</p>
          </div>
        )}

        {activeTab === "moderation" && (
          <div className={styles.sidebarSection}>
            <div className={styles.sidebarHeader}>
              <h3>Moderation log</h3>
              <span className={styles.sidebarMeta}>
                {moderationFlags.length} item
                {moderationFlags.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className={styles.flagListCompact}>
              {moderationFlags.map((flag) => (
                <li key={flag.flagId} className={styles.flagItem}>
                  <span className={`${styles.flagPill} ${styles[flag.severity]}`}>
                    {moderationBadge(flag.severity)}
                  </span>
                  <div>
                    <div className={styles.flagReason}>{flag.reason}</div>
                    <div className={styles.flagMeta}>Message: {flag.messageId}</div>
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
  );
}

type SidebarTabsProps = {
  activeTab: "rules" | "verification" | "moderation";
  onTabChange: (tab: "rules" | "verification" | "moderation") => void;
  disableDataTabs: boolean;
};

function SidebarTabs({ activeTab, onTabChange, disableDataTabs }: SidebarTabsProps) {
  return (
    <div className={styles.tabList}>
      {(["rules", "verification", "moderation"] as const).map((tab) => {
        const isDisabled = disableDataTabs && tab !== "rules";
        return (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ""} ${
              isDisabled ? styles.tabDisabled : ""
            }`}
            disabled={isDisabled}
            onClick={() => onTabChange(tab)}
          >
            {tab === "rules"
              ? "Official Rules"
              : tab === "verification"
              ? "Verification"
              : "Moderation"}
          </button>
        );
      })}
    </div>
  );
}

type OfficialRulesPanelProps = {
  rules: AugmentedThread["officialRules"];
};

function OfficialRulesPanel({ rules }: OfficialRulesPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!rules.length) {
    return (
      <div className={styles.sidebarSection}>
        <h3>Official rules</h3>
        <p className={styles.sidebarMeta}>No rules provided.</p>
      </div>
    );
  }

  return (
    <div className={styles.sidebarSection}>
      <div className={styles.sidebarHeader}>
        <h3>Official rules</h3>
        <p className={styles.small}>AI references only approved sources.</p>
      </div>
      <ul className={styles.ruleList}>
        {rules.map((rule) => {
          const isExpanded = expanded[rule.ruleId];
          const preview =
            rule.content.length > 140 && !isExpanded
              ? `${rule.content.slice(0, 140)}…`
              : rule.content;

          // Summaries keep rules scannable; expand only when the user asks.
          return (
            <li key={rule.ruleId} className={styles.ruleCard}>
              <div className={styles.ruleHeader}>
                <div className={styles.ruleTitle}>{rule.title}</div>
                <span className={styles.ruleMeta}>Category: {rule.category}</span>
              </div>
              <p className={styles.ruleContent}>{preview}</p>
              <button
                className={styles.ruleToggle}
                onClick={() =>
                  setExpanded((prev) => ({ ...prev, [rule.ruleId]: !isExpanded }))
                }
              >
                {isExpanded ? "Hide full text" : "Show full text"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
