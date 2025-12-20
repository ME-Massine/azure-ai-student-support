"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Mode = "rules" | "rights" | "guidance";

const MODE_LABELS: Record<Mode, string> = {
  rules: "School Rules",
  rights: "Student Rights",
  guidance: "What Should I Do?",
};

type Language = "en" | "fr" | "ar" | "es";

const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
  es: "Español",
};

const WELCOME_MESSAGE: Record<Language, string> = {
  en: "Hi! I’m here to help you understand school rules and school procedures.",
  fr: "Bonjour ! Je suis là pour t’aider à comprendre les règles scolaires.",
  ar: "مرحباً! أنا هنا لمساعدتك في فهم القوانين والإجراءات المدرسية.",
  es: "¡Hola! Estoy aquí para ayudarte a entender las normas escolares.",
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [mode, setMode] = useState<Mode>("rules");

  const [showInfo, setShowInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<"rules" | "rights" | "help">(
    "rules"
  );
  const [officialData, setOfficialData] = useState<any>(null);

  const MAX_CHARS = 800;
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* Load official non-AI data */
  useEffect(() => {
    if (!showInfo) return;

    fetch(`/data/official/rules.${language}.json`)
      .then((res) => res.json())
      .then(setOfficialData)
      .catch(() => setOfficialData(null));
  }, [showInfo, language]);

  /* Reset conversation on language or mode change */
  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content: WELCOME_MESSAGE[language],
      },
    ]);
  }, [language, mode]);

  /* Auto-scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];

    setInput("");
    setMessages(updatedMessages);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    setLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const memory = updatedMessages.slice(-6);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: memory, language, mode }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        setMessages((prev) => {
          const copy = [...prev];
          const last = copy.length - 1;
          if (copy[last]?.role === "assistant") {
            copy[last] = {
              role: "assistant",
              content: copy[last].content + chunk,
            };
          }
          return copy;
        });
      }
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content:
            language === "fr"
              ? "Une erreur est survenue."
              : language === "ar"
              ? "حدث خطأ."
              : language === "es"
              ? "Ocurrió un error."
              : "Something went wrong.",
        };
        return copy;
      });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }

  function resetConversation() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setMessages([{ role: "assistant", content: WELCOME_MESSAGE[language] }]);
  }

  return (
    <main className="container">
      {/* HEADER */}
      <header className="header">
        <h1 className="title">AI Student Support Navigator</h1>

        <div className="header-controls">
          <div className="selectors">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="language-select"
            >
              {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="mode-select"
            >
              {Object.entries(MODE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="actions">
            <button
              onClick={resetConversation}
              className="reset-btn"
              disabled={loading}
            >
              Reset
            </button>
            <button className="info-btn" onClick={() => setShowInfo(true)}>
              Official Info
            </button>
          </div>
        </div>
      </header>

      {/* CONTEXT BAR */}
      <div className="context-bar">
        <span className="context-mode">{MODE_LABELS[mode]}</span>
        <span className="context-scope">
          Institutional · School-only · Support-oriented
        </span>
      </div>

      {/* CHAT */}
      <div className="chat-window">
        <div className="chat-content">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`bubble ${msg.role === "user" ? "user" : "ai"}`}
              dir={language === "ar" ? "rtl" : "ltr"}
            >
              {msg.content}
            </div>
          ))}

          {loading && (
            <div className="bubble ai typing">
              Generating institutional response…
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* INPUT */}
      <div className="input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_CHARS}
          placeholder={
            language === "fr"
              ? "Posez une question scolaire…"
              : language === "ar"
              ? "اطرح سؤالاً مدرسياً…"
              : language === "es"
              ? "Haz una pregunta escolar…"
              : "Ask a school-related question…"
          }
          dir={language === "ar" ? "rtl" : "ltr"}
        />

        <div className="input-actions">
          <button onClick={sendMessage} disabled={loading || !input.trim()}>
            Send
          </button>

          {loading && (
            <button onClick={stopStreaming} className="stop-btn">
              Stop
            </button>
          )}
        </div>
      </div>

      <div className="char-count">
        {input.length}/{MAX_CHARS}
      </div>

      {/* OFFICIAL INFO PANEL */}
      {showInfo && officialData && (
        <aside className="info-panel">
          <header>
            <div>
              <h2>Official School Information</h2>
              <span className="verified">
                Verified source · Not generated by AI
              </span>
            </div>
            <button onClick={() => setShowInfo(false)}>✕</button>
          </header>

          <nav className="tabs">
            {(["rules", "rights", "help"] as const).map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => setActiveTab(tab)}
              >
                {officialData[tab].title}
              </button>
            ))}
          </nav>

          <ul>
            {officialData[activeTab].items.map(
              (item: string, i: number) => (
                <li key={i}>{item}</li>
              )
            )}
          </ul>

          <footer>{officialData.footer}</footer>
        </aside>
      )}
    </main>
  );
}
