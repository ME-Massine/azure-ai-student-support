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
  en: "Hi! I’m here to help you understand school rules and answer your questions.",
  fr: "Bonjour ! Je suis là pour t’aider à comprendre les règles scolaires.",
  ar: "مرحباً! أنا هنا لمساعدتك في فهم قوانين المدرسة.",
  es: "¡Hola! Estoy aquí para ayudarte a entender las reglas escolares.",
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [mode, setMode] = useState<Mode>("rules");

  const MAX_CHARS = 800;
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* 🔹 Reset conversation when language or mode changes */
  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content: WELCOME_MESSAGE[language],
      },
    ]);
  }, [language, mode]);

  /* 🔹 Auto-scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];

    setInput("");
    setMessages(updatedMessages);

    // Prepare assistant streaming bubble
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
        body: JSON.stringify({
          messages: memory,
          language,
          mode,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        setMessages((prev) => {
          const copy = [...prev];
          const lastIdx = copy.length - 1;
          if (copy[lastIdx]?.role === "assistant") {
            copy[lastIdx] = {
              role: "assistant",
              content: copy[lastIdx].content + chunk,
            };
          }
          return copy;
        });
      }
    } catch {
      const msg =
        language === "fr"
          ? "Une erreur est survenue."
          : language === "ar"
          ? "حدث خطأ."
          : language === "es"
          ? "Ocurrió un error."
          : "Something went wrong.";

      setMessages((prev) => {
        const copy = [...prev];
        const lastIdx = copy.length - 1;
        if (copy[lastIdx]?.role === "assistant") {
          copy[lastIdx] = { role: "assistant", content: msg };
        } else {
          copy.push({ role: "assistant", content: msg });
        }
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
    // Stop any ongoing stream
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);

    // Reset messages to welcome state
    setMessages([
      {
        role: "assistant",
        content: WELCOME_MESSAGE[language],
      },
    ]);
  }

  return (
    <main className="container">
      <header className="header">
        <h1 className="title">AI Student Support Navigator</h1>

        <div className="header-controls">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="language-select"
          >
            {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="mode-select"
          >
            {Object.entries(MODE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <button
            onClick={resetConversation}
            className="reset-btn"
            disabled={loading}
          >
            Reset
          </button>
        </div>
      </header>

      {/* 🔹 Mode indicator */}
      <div className="mode-indicator">Mode: {MODE_LABELS[mode]}</div>

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

          {loading && <div className="bubble ai typing">AI is typing…</div>}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_CHARS}
          placeholder={
            language === "fr"
              ? "Posez une question sur l'école..."
              : language === "ar"
              ? "اطرح سؤالاً حول المدرسة..."
              : language === "es"
              ? "Haz una pregunta sobre la escuela..."
              : "Ask a question about school..."
          }
          dir={language === "ar" ? "rtl" : "ltr"}
        />

        <button onClick={sendMessage} disabled={loading || !input.trim()}>
          {loading ? "…" : "Send"}
        </button>

        {loading && (
          <button onClick={stopStreaming} className="stop-btn">
            Stop
          </button>
        )}
      </div>

      <div className="char-count">
        {input.length}/{MAX_CHARS}
      </div>
    </main>
  );
}
