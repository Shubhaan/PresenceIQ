import "dotenv/config";
import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT || 8080);
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const ollamaModel = process.env.OLLAMA_MODEL || "llama3.1:8b";
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";

app.use(cors({ origin: allowedOrigin === "*" ? true : allowedOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "presenceiq-ai-backend",
    model: ollamaModel,
  });
});

function sanitizeMetrics(metrics = {}) {
  return {
    studyHours: Number(metrics.studyHours || 0),
    sleepHours: Number(metrics.sleepHours || 0),
    steps: Number(metrics.steps || 0),
    learningScreenTime: Number(metrics.learningScreenTime || 0),
    socialMediaHours: Number(metrics.socialMediaHours || 0),
    mood: typeof metrics.mood === "string" ? metrics.mood : "steady",
  };
}

function buildPrompt(payload) {
  const metrics = sanitizeMetrics(payload.metrics);
  const examMode = Boolean(payload.examMode);
  const score = Number(payload.score || 0);
  const burnoutRisk = typeof payload.burnoutRisk === "string" ? payload.burnoutRisk : "low";
  const digitalHygiene = typeof payload.digitalHygiene === "string" ? payload.digitalHygiene : "";

  return [
    "You are PresenceIQ, a calm student wellness and productivity coach.",
    "Return exactly 3 short actionable suggestions as a JSON object with this shape:",
    '{"suggestions":["...", "...", "..."]}',
    "Each suggestion must be one sentence, practical, and supportive.",
    "Avoid medical claims, diagnosis, shame, or generic fluff.",
    "Focus on study balance, sleep, movement, focus, and recovery.",
    examMode ? "Exam mode is ON, so prioritize clarity and sustainable performance." : "Exam mode is OFF.",
    `Effectiveness score: ${score}/100`,
    `Burnout risk: ${burnoutRisk}`,
    `Digital hygiene note: ${digitalHygiene}`,
    `Study hours: ${metrics.studyHours}`,
    `Sleep hours: ${metrics.sleepHours}`,
    `Steps: ${metrics.steps}`,
    `Learning screen time: ${metrics.learningScreenTime}`,
    `Passive social media hours: ${metrics.socialMediaHours}`,
    `Mood: ${metrics.mood}`,
  ].join("\n");
}

function tryParseSuggestions(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.suggestions)) {
      return parsed.suggestions
        .filter((item) => typeof item === "string" && item.trim().length > 0)
        .slice(0, 3);
    }
  } catch (_error) {
    return null;
  }

  return null;
}

app.post("/api/suggestions", async (req, res) => {
  try {
    const prompt = buildPrompt(req.body || {});

    const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        prompt,
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(502).json({
        ok: false,
        error: "ollama_request_failed",
        detail: errorText,
      });
      return;
    }

    const data = await response.json();
    const suggestions = tryParseSuggestions(data.response || "");

    if (!suggestions || suggestions.length === 0) {
      res.status(502).json({
        ok: false,
        error: "invalid_ollama_output",
        detail: data.response || "",
      });
      return;
    }

    res.json({
      ok: true,
      suggestions,
      model: ollamaModel,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "server_error",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`PresenceIQ AI backend listening on http://0.0.0.0:${port}`);
});
