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
  if (messageType === "ai_verification") return "AI Verifier";
  if (messageType === "system_warning") return "System";
  if (role === "ai") return "AI Assistant";
  return role === "senior" ? "Senior Student" : "Student";
}

function verificationBadge(status: ChatMessage["verifiedStatus"]) {
  if (status === "verified") return "Verified";
  if (status === "partially_verified") return "Partially Verified";
  if (status === "conflict") return "Conflicting Info";
  return "Unverified";
}

function moderationBadge(severity: ModerationFlag["severity"]) {
  if (severity === "high") return "High Risk";
  if (severity === "medium") return "Review Needed";
  return "Low Risk";
}

function statusChip(
  message: ChatMessage,
  moderation?: ModerationFlag
): { label: string; type: string } | null {
  if (moderation) {
    return {
      label: moderationBadge(moderation.severity),
      type: moderation.severity,
    };
  }
  if (message.verifiedStatus !== "unverified") {
    return {
      label: verificationBadge(message.verifiedStatus),
      type: message.verifiedStatus,
    };
  }
  if (message.messageType === "student_answer") {
    return { label: "Pending Review", type: "pending" };
  }
  return null;
}

function roleIcon(
  role: ChatMessage["senderRole"],
  type: ChatMessage["messageType"]
) {
  if (type === "ai_verification") return "✓";
  if (type === "system_warning") return "⚠";
  if (role === "senior") return "★";
  if (role === "ai") return "◆";
  return "●";
}

export default function GeneralChatPage() {
  const [thread, setThread] = useState<AugmentedThread | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null
  );
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
        setStatus("Unable to start chat session.");
        return;
      }

      const data = await res.json();
      setThread(data.thread);
    } catch (error) {
      console.error("Failed to bootstrap chat thread", error);
      setStatus(
        "Unable to start chat. Please check your connection and retry."
      );
    }
  }

  useEffect(() => {
    bootstrapThread();
  }, []);
 
  useEffect(() => {
    if (thread?.messages.length && !selectedMessageId) {
      setSelectedMessageId(
        thread.messages[thread.messages.length - 1].messageId
      );
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
    setStatus("Requesting AI verification…");
    try {
      const res = await fetch("/api/chat/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.messageId }),
      });

      if (!res.ok) {
        setStatus("Verification request failed");
        return;
      }

      const data = await res.json();
      setThread(data.thread);
      setStatus("AI verification completed.");
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
          Student Chat
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
              <span className={styles.bannerIcon}>⚠</span>
              <div>
                <strong>High-Risk Content Detected</strong>
                <p>Review flagged messages before sharing externally.</p>
              </div>
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
            currentUserId={demoUser.userId}
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
      <div className={styles.headerContent}>
        <p className={styles.kicker}>
          Azure Communication Services · Real-time Moderation
        </p>
        <h1 className={styles.title}>Student Chat</h1>
        <p className={styles.subtitle}>
          Peer-to-peer communication with AI-powered verification and content
          moderation. All messages are immutable; AI responses appear as
          separate entries.
        </p>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>School</span>
          <span className={styles.metaValue}>{schoolId}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Language</span>
          <span className={styles.metaValue}>{language.toUpperCase()}</span>
        </div>
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
      ? "High Risk"
      : "Warnings Present";

  const moderationClass = highRisk
    ? styles.statusDanger
    : moderationFlags.length > 0
    ? styles.statusWarning
    : styles.statusSuccess;

  return (
    <div className={styles.statusBar}>
      <div className={styles.statusGroup}>
        <span className={styles.statusLabel}>Verification</span>
        <span className={styles.statusValue}>
          {verificationCoverage}%
          <span className={styles.statusDetail}>
            {verifiedCount} of {verifiedCount + pendingCount}
          </span>
        </span>
      </div>
      <span className={styles.statusDivider} />
      <div className={styles.statusGroup}>
        <span className={styles.statusLabel}>Moderation</span>
        <span className={`${styles.statusValue} ${moderationClass}`}>
          {moderationSummary}
        </span>
      </div>
      <span className={styles.statusDivider} />
      <div className={styles.statusGroup}>
        <span className={styles.statusLabel}>Audit Trail</span>
        <span className={styles.statusValue}>
          {auditRecords} {auditRecords === 1 ? "record" : "records"}
        </span>
      </div>
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
  currentUserId: string;
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
  currentUserId,
}: ChatTimelineProps) {
  if (!messages.length) {
    return <EmptyChatState />;
  }

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
                e.preventDefault();
                onToggleDetails(message.messageId);
                onSelectMessage(message.messageId);
              }
            }}
          >
            <div className={styles.messageHeader}>
              <span
                className={`${styles.roleIcon} ${
                  styles[`roleIcon${message.senderRole}`]
                }`}
              >
                {roleIcon(message.senderRole, message.messageType)}
              </span>
              <div className={styles.messageHeaderInfo}>
                <span className={styles.sender}>
                  {roleBadge(message.senderRole, message.messageType)}
                </span>
                <span className={styles.timestamp}>
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {chip && (
                <span
                  className={`${styles.statusChip} ${
                    styles[`chip${chip.type}`]
                  }`}
                >
                  {chip.label}
                </span>
              )}
              <button
                className={styles.chevron}
                aria-label={isExpanded ? "Collapse details" : "Expand details"}
                onClick={(e) => e.stopPropagation()}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                >
                  <path
                    d="M4 6L8 10L12 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <p className={styles.content}>{message.content}</p>

            <div className={styles.messageFoot}>
              <span
                className={`${styles.roleTag} ${
                  styles[`tag${message.senderRole}`]
                }`}
              >
                {message.senderRole === "student" ? "Human" : "AI"}
              </span>
              {verification && (
                <span className={styles.footBadge}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M10 3L4.5 8.5L2 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Verified
                </span>
              )}
              {moderation && moderation.severity !== "low" && (
                <span className={styles.footBadge}>
                  {moderationBadge(moderation.severity)}
                </span>
              )}
            </div>

            {isExpanded && (
              <div className={styles.detailsPanel}>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>
                      Verification Status
                    </div>
                    <div className={styles.detailBody}>
                      {verification || "Not yet requested"}
                    </div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Moderation Check</div>
                    <div className={styles.detailBody}>
                      {moderation
                        ? `${moderationBadge(moderation.severity)} · ${
                            moderation.reason
                          }`
                        : "No issues detected"}
                    </div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Official Sources</div>
                    <div className={styles.detailBody}>
                      {officialSourcesByMessage[message.messageId]?.length
                        ? officialSourcesByMessage[message.messageId].join(", ")
                        : "None referenced"}
                    </div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Full Timestamp</div>
                    <div className={styles.detailBody}>
                      {new Date(message.createdAt).toLocaleString()}
                    </div>
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
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                      >
                        <path
                          d="M12 4L5.5 10.5L2 7"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Request AI Verification
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
      <div className={styles.emptyIcon}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect
            x="8"
            y="12"
            width="32"
            height="24"
            rx="4"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M8 20h32M16 16v-4M32 16v-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className={styles.emptyTitle}>Chat Ready</p>
      <p className={styles.emptyBody}>
        Start a conversation. AI verification and moderation checks will appear
        automatically after posting.
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
    <div className={styles.composer}>
      <label className={styles.visuallyHidden} htmlFor="composer">
        Message composer
      </label>
      <textarea
        id="composer"
        className={styles.composerTextarea}
        placeholder="Type your message…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={3}
        disabled={loading}
      />
      <div className={styles.composerFooter}>
        <span className={styles.composerHint}>
          {loading ? "Sending…" : "⌘ + Enter to send"}
        </span>
        {status && <span className={styles.composerStatus}>{status}</span>}
        <button
          className={styles.sendBtn}
          onClick={onSend}
          disabled={!value.trim() || loading}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 8h12M10 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Send
        </button>
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
      : "None";

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
              <h3 className={styles.sidebarTitle}>Verification Details</h3>
              {selectedMessage && (
                <span className={styles.sidebarBadge}>
                  {selectedMessage.messageId.slice(0, 8)}
                </span>
              )}
            </div>
            <div className={styles.sidebarContent}>
              {verificationText ? (
                <>
                  <p className={styles.sidebarText}>{verificationText}</p>
                  <div className={styles.sidebarMeta}>
                    <strong>Sources:</strong> {verificationSources}
                  </div>
                </>
              ) : (
                <p className={styles.sidebarEmpty}>
                  No AI verification available for this message.
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === "moderation" && (
          <div className={styles.sidebarSection}>
            <div className={styles.sidebarHeader}>
              <h3 className={styles.sidebarTitle}>Moderation Log</h3>
              <span className={styles.sidebarCount}>
                {moderationFlags.length}
              </span>
            </div>
            {moderationFlags.length > 0 ? (
              <ul className={styles.flagList}>
                {moderationFlags.map((flag) => (
                  <li key={flag.flagId} className={styles.flagItem}>
                    <div
                      className={`${styles.flagSeverity} ${
                        styles[`severity${flag.severity}`]
                      }`}
                    >
                      {moderationBadge(flag.severity)}
                    </div>
                    <div className={styles.flagContent}>
                      <div className={styles.flagReason}>{flag.reason}</div>
                      <div className={styles.flagMeta}>
                        Message ID: {flag.messageId.slice(0, 12)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.sidebarEmpty}>
                No moderation events recorded.
              </p>
            )}
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

function SidebarTabs({
  activeTab,
  onTabChange,
  disableDataTabs,
}: SidebarTabsProps) {
  const tabs = [
    { id: "rules" as const, label: "Rules", icon: "📋" },
    { id: "verification" as const, label: "Verification", icon: "✓" },
    { id: "moderation" as const, label: "Moderation", icon: "⚠" },
  ];

  return (
    <div className={styles.tabList}>
      {tabs.map((tab) => {
        const isDisabled = disableDataTabs && tab.id !== "rules";
        return (
          <button
            key={tab.id}
            className={`${styles.tab} ${
              activeTab === tab.id ? styles.activeTab : ""
            } ${isDisabled ? styles.tabDisabled : ""}`}
            disabled={isDisabled}
            onClick={() => onTabChange(tab.id)}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            {tab.label}
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
        <h3 className={styles.sidebarTitle}>Official Rules</h3>
        <p className={styles.sidebarEmpty}>
          No official rules have been configured.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.sidebarSection}>
      <div className={styles.sidebarHeader}>
        <h3 className={styles.sidebarTitle}>Official Rules</h3>
        <span className={styles.sidebarCount}>{rules.length}</span>
      </div>
      <p className={styles.sidebarDescription}>
        AI responses reference only these approved sources.
      </p>
      <ul className={styles.ruleList}>
        {rules.map((rule) => {
          const isExpanded = expanded[rule.ruleId];
          const preview =
            rule.content.length > 140 && !isExpanded
              ? `${rule.content.slice(0, 140)}…`
              : rule.content;

          return (
            <li key={rule.ruleId} className={styles.ruleCard}>
              <div className={styles.ruleHeader}>
                <div className={styles.ruleTitle}>{rule.title}</div>
                <span className={styles.ruleCategory}>{rule.category}</span>
              </div>
              <p className={styles.ruleContent}>{preview}</p>
              {rule.content.length > 140 && (
                <button
                  className={styles.ruleToggle}
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [rule.ruleId]: !isExpanded,
                    }))
                  }
                >
                  {isExpanded ? "Show less" : "Show more"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
