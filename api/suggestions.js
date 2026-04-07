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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const expectedApiKey = process.env.PRESENCEIQ_API_KEY || "";
  const requestApiKey = req.headers["x-presenceiq-key"];

  if (!expectedApiKey || requestApiKey !== expectedApiKey) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "";
  const ollamaModel = process.env.OLLAMA_MODEL || "llama3.1:8b";

  if (!ollamaBaseUrl) {
    res.status(500).json({ ok: false, error: "missing_ollama_base_url" });
    return;
  }

  try {
    const response = await fetch(`${ollamaBaseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: buildPrompt(req.body || {}),
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      res.status(502).json({
        ok: false,
        error: "ollama_request_failed",
        detail,
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

    res.status(200).json({
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
}
