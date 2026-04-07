import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const state = {
  examMode: false,
  user: null,
  auth: {
    ready: false,
    enabled: false,
    busy: false,
    mode: "disabled",
    message: "Add your Firebase web config to enable sign-in.",
    instance: null,
    provider: null,
  },
  metrics: {
    studyHours: 6,
    sleepHours: 7.5,
    steps: 6500,
    learningScreenTime: 3,
    socialMediaHours: 2,
    mood: "steady",
  },
};

const valueFormatters = {
  studyHours: (value) => `${value} hrs`,
  sleepHours: (value) => `${value} hrs`,
  steps: (value) => `${Math.round(value)} steps`,
  learningScreenTime: (value) => `${value} hrs`,
  socialMediaHours: (value) => `${value} hrs`,
};

const scoreWeights = {
  standard: {
    study: 0.4,
    sleep: 0.3,
    steps: 0.2,
    social: 0.1,
    learningBonus: 0.08,
  },
  exam: {
    study: 0.42,
    sleep: 0.33,
    steps: 0.15,
    social: 0.1,
    learningBonus: 0.1,
  },
};

const sampleDay = {
  studyHours: 8.5,
  sleepHours: 5.5,
  steps: 3200,
  learningScreenTime: 5,
  socialMediaHours: 3.5,
  mood: "drained",
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeStudy(hours) {
  return clamp((hours / 8) * 100, 0, 100);
}

function normalizeSleep(hours) {
  const distanceFromIdeal = Math.abs(hours - 8);
  return clamp(100 - distanceFromIdeal * 18, 0, 100);
}

function normalizeSteps(steps) {
  return clamp((steps / 10000) * 100, 0, 100);
}

function normalizeSocial(hours) {
  return clamp((hours / 6) * 100, 0, 100);
}

function normalizeLearning(hours) {
  return clamp((hours / 5) * 100, 0, 100);
}

function getMoodModifier(mood) {
  if (mood === "energized") return 4;
  if (mood === "drained") return -6;
  return 0;
}

function getWeights() {
  return state.examMode ? scoreWeights.exam : scoreWeights.standard;
}

function calculateEffectiveness(metrics) {
  const weights = getWeights();
  const normalized = {
    study: normalizeStudy(metrics.studyHours),
    sleep: normalizeSleep(metrics.sleepHours),
    steps: normalizeSteps(metrics.steps),
    social: normalizeSocial(metrics.socialMediaHours),
    learning: normalizeLearning(metrics.learningScreenTime),
  };

  const baseScore =
    normalized.study * weights.study +
    normalized.sleep * weights.sleep +
    normalized.steps * weights.steps -
    normalized.social * weights.social +
    normalized.learning * weights.learningBonus;

  return {
    score: clamp(Math.round(baseScore + getMoodModifier(metrics.mood)), 0, 100),
    normalized,
    weights,
  };
}

function assessBurnout(metrics, score) {
  const studyLoadHigh = metrics.studyHours >= 8;
  const lowSleep = metrics.sleepHours < 6.5;
  const lowMovement = metrics.steps < 4000;
  const passiveDrift = metrics.socialMediaHours >= 3;
  const drained = metrics.mood === "drained";

  let risk = "low";
  let recovery = "Balanced";

  if ((studyLoadHigh && lowSleep) || (studyLoadHigh && lowMovement && drained)) {
    risk = "high";
    recovery = "Recovery needed";
  } else if (lowSleep || passiveDrift || score < 60) {
    risk = "moderate";
    recovery = "Watch energy";
  }

  return { risk, recovery };
}

function getScoreLabel(score) {
  if (score >= 85) return "Peak rhythm";
  if (score >= 70) return "Stable";
  if (score >= 55) return "Needs tuning";
  return "At risk";
}

function getDigitalHygiene(metrics) {
  const totalScreen = metrics.learningScreenTime + metrics.socialMediaHours;

  if (totalScreen === 0) {
    return {
      learningShare: 0,
      passiveShare: 0,
      message: "No screen activity logged yet. Add time to compare productive and passive usage.",
    };
  }

  const learningShare = Math.round((metrics.learningScreenTime / totalScreen) * 100);
  const passiveShare = 100 - learningShare;

  let message = "Your digital time is mostly working for you.";

  if (passiveShare >= 55) {
    message = "Passive screen time is dominating today. A short offline reset could protect your focus.";
  } else if (learningShare >= 70) {
    message = "Most of your screen time supports learning. Keep breaks deliberate so this stays sustainable.";
  }

  return { learningShare, passiveShare, message };
}

function getScoreTier(score) {
  if (score >= 85) return "peak";
  if (score >= 70) return "strong";
  if (score >= 55) return "fragile";
  return "risk";
}

function buildNudges(metrics, score, burnout, hygiene) {
  const suggestions = [];
  const scoreTier = getScoreTier(score);

  const scoreTemplates = {
    peak: [
      "Today is working well. Keep the next study block short and finish with a light review instead of pushing into fatigue.",
      "Your score is high because output and recovery are both cooperating. Protect that by ending the day cleanly instead of squeezing in extra low-quality work.",
    ],
    strong: [
      "You are in a good range. One focused block on the most important task will move the day forward more than trying to do everything at once.",
      "The day is stable, so think in priorities instead of volume. Finish one meaningful task completely before opening a new one.",
    ],
    fragile: [
      "Your score suggests the day needs stabilization. Shrink the next task, complete it cleanly, and recover before starting another long session.",
      "This is a rebuild day. Go for one useful win, then shift attention toward sleep, movement, and mental reset.",
    ],
    risk: [
      "Your score is in a recovery-first range. Avoid forcing deep work right now and switch to the smallest valuable task you can finish calmly.",
      "The best move today is not more pressure. Lower the workload, remove distractions, and focus on protecting energy for tomorrow.",
    ],
  };

  suggestions.push(scoreTemplates[scoreTier][0]);

  if (burnout.risk === "high") {
    suggestions.push("Your pattern looks like burnout risk: high effort without enough recovery. Replace the next heavy session with food, water, and a 20-minute reset.");
  } else if (burnout.risk === "moderate") {
    suggestions.push("Energy is slipping. Time-box the next study session and stop when the timer ends instead of letting the day drift.");
  }

  if (metrics.sleepHours < 6) {
    suggestions.push("Sleep is the biggest limiter right now. Aim for an earlier stop tonight or add a short nap before attempting difficult cognitive work.");
  } else if (metrics.sleepHours < 7) {
    suggestions.push("You can still have a decent day, but only if recovery stays visible. Protect tonight's sleep before adding extra study time.");
  }

  if (metrics.steps < 4000) {
    suggestions.push("Movement is too low for the mental load you're carrying. Take a 10 to 15 minute walk before your next focus block.");
  } else if (metrics.steps >= 9000 && scoreTier !== "risk") {
    suggestions.push("Your movement is supporting the day well. Use that momentum and return to work with one clearly defined goal.");
  }

  if (metrics.socialMediaHours > metrics.learningScreenTime) {
    suggestions.push("Passive screen time is overtaking useful screen time. Put your phone away for one full study sprint and reassess after that.");
  } else if (hygiene.learningShare >= 70) {
    suggestions.push("Most of your screen time is supporting learning. Keep your breaks deliberate so productive time does not slide into low-value scrolling.");
  }

  if (state.examMode) {
    suggestions.push(
      scoreTier === "peak" || scoreTier === "strong"
        ? "Exam Mode is on, so protect clarity. Stop while you still feel sharp instead of studying until the quality drops."
        : "Exam Mode is on, so recovery matters even more. Stabilize sleep and attention before trying to increase raw study hours."
    );
  }

  if (metrics.mood === "drained") {
    suggestions.push("You marked yourself as drained, so lower the entry barrier. Start with the easiest high-value task and build momentum from there.");
  } else if (metrics.mood === "energized" && scoreTier !== "risk") {
    suggestions.push("Your mood is working in your favor today. Use that energy on the hardest task first while focus is naturally higher.");
  }

  suggestions.push(scoreTemplates[scoreTier][1]);

  return [...new Set(suggestions)].slice(0, 3);
}

function setRing(score) {
  const degrees = Math.round((score / 100) * 360);
  const scoreRing = document.getElementById("scoreRing");
  scoreRing.style.background = `
    radial-gradient(circle at center, var(--paper-strong) 0 55%, transparent 56%),
    conic-gradient(var(--accent) 0deg, var(--accent-soft) ${degrees}deg, rgba(24, 33, 38, 0.08) ${degrees}deg 360deg)
  `;
}

function renderBreakdown(normalized) {
  const items = [
    { label: "Study quality", value: normalized.study, tone: "normal" },
    { label: "Sleep recovery", value: normalized.sleep, tone: "normal" },
    { label: "Physical activity", value: normalized.steps, tone: "normal" },
    { label: "Passive social load", value: normalized.social, tone: "danger" },
  ];

  const breakdownList = document.getElementById("breakdownList");
  breakdownList.innerHTML = items
    .map(
      (item) => `
        <div class="breakdown-item">
          <header>
            <span>${item.label}</span>
            <strong>${Math.round(item.value)} / 100</strong>
          </header>
          <div class="bar-track ${item.tone === "danger" ? "danger" : ""}">
            <span style="width:${Math.round(item.value)}%"></span>
          </div>
        </div>
      `
    )
    .join("");
}

function renderNudges(nudges) {
  const nudgeList = document.getElementById("nudgeList");
  nudgeList.innerHTML = nudges.map((nudge) => `<li>${nudge}</li>`).join("");
}

function setAiStatus(message) {
  const aiStatusText = document.getElementById("aiStatusText");

  if (aiStatusText) {
    aiStatusText.textContent = message;
  }
}

function getInitials(user) {
  const name = user?.displayName?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return user?.email?.[0]?.toUpperCase() ?? "P";
}

function renderAuthState() {
  const authPanel = document.querySelector(".top-auth-panel");
  const statusLabel = document.getElementById("authStatusLabel");
  const statusTitle = document.getElementById("authStatusTitle");
  const statusText = document.getElementById("authStatusText");
  const avatar = document.getElementById("authAvatar");
  const actionButton = document.getElementById("authActionButton");
  const signOutButton = document.getElementById("authSignOutButton");

  if (!state.auth.enabled) {
    authPanel?.classList.remove("compact-auth");
    statusLabel.textContent = "Auth not configured";
    statusTitle.textContent = "Enable sign-in";
    statusText.textContent = state.auth.message;
    avatar.textContent = "P";
    actionButton.textContent = "Continue with Google";
    actionButton.disabled = true;
    signOutButton.classList.add("hidden");
    return;
  }

  if (state.auth.busy) {
    authPanel?.classList.remove("compact-auth");
    statusLabel.textContent = "Working";
    statusTitle.textContent = "Opening Google sign-in...";
    statusText.textContent = "Finish the popup to connect your profile.";
    actionButton.disabled = true;
    signOutButton.disabled = true;
    return;
  }

  actionButton.disabled = false;
  signOutButton.disabled = false;

  if (state.user) {
    authPanel?.classList.add("compact-auth");
    statusLabel.textContent = "Signed in";
    statusTitle.textContent = state.user.displayName || "Student account connected";
    statusText.textContent = state.user.email || "Your PresenceIQ session is now personalized through Firebase Auth.";
    avatar.textContent = getInitials(state.user);
    actionButton.textContent = "Connected";
    actionButton.disabled = true;
    signOutButton.classList.remove("hidden");
    return;
  }

  authPanel?.classList.remove("compact-auth");
  statusLabel.textContent = "Ready";
  statusTitle.textContent = "Sign in with Google";
  statusText.textContent = "Auth is ready for this dashboard.";
  avatar.textContent = "G";
  actionButton.textContent = "Continue with Google";
  signOutButton.classList.add("hidden");
}

function render() {
  const { score, normalized } = calculateEffectiveness(state.metrics);
  const burnout = assessBurnout(state.metrics, score);
  const hygiene = getDigitalHygiene(state.metrics);
  const nudges = buildNudges(state.metrics, score, burnout, hygiene);

  document.getElementById("scoreValue").textContent = score;
  document.getElementById("scoreLabel").textContent = getScoreLabel(score);
  document.getElementById("burnoutLabel").textContent = burnout.risk[0].toUpperCase() + burnout.risk.slice(1);
  document.getElementById("recoveryLabel").textContent = burnout.recovery;
  document.getElementById("learningShareLabel").textContent = `${hygiene.learningShare}%`;
  document.getElementById("passiveShareLabel").textContent = `${hygiene.passiveShare}%`;
  document.getElementById("learningBar").style.width = `${hygiene.learningShare}%`;
  document.getElementById("passiveBar").style.width = `${hygiene.passiveShare}%`;
  document.getElementById("digitalHygieneMessage").textContent = hygiene.message;

  setRing(score);
  renderBreakdown(normalized);
  renderNudges(nudges);
  renderAuthState();
  setAiStatus(`Suggestions are adapting live for a ${score}/100 score with ${burnout.risk} burnout risk.`);
}

function syncInputValue(id, value) {
  const output = document.getElementById(`${id}Value`);
  if (output && valueFormatters[id]) {
    output.textContent = valueFormatters[id](value);
  }
}

function parseNumericInput(input, fallbackValue) {
  const numericValue = Number(input.value);

  if (Number.isNaN(numericValue)) {
    return fallbackValue;
  }

  const min = input.min === "" ? -Infinity : Number(input.min);
  const max = input.max === "" ? Infinity : Number(input.max);
  return clamp(numericValue, min, max);
}

function bindInputs() {
  Object.keys(state.metrics).forEach((key) => {
    const input = document.getElementById(key);
    if (!input) return;

    if (input.tagName === "SELECT") {
      input.addEventListener("change", (event) => {
        state.metrics[key] = event.target.value;
        render();
      });
      return;
    }

    syncInputValue(key, state.metrics[key]);
    const handleNumericChange = (event) => {
      const numericValue = parseNumericInput(event.target, state.metrics[key]);
      state.metrics[key] = numericValue;
      event.target.value = numericValue;
      syncInputValue(key, numericValue);
      render();
    };

    input.addEventListener("input", handleNumericChange);
    input.addEventListener("change", handleNumericChange);
  });
}

function loadStateIntoForm() {
  Object.entries(state.metrics).forEach(([key, value]) => {
    const input = document.getElementById(key);
    if (!input) return;
    input.value = value;
    syncInputValue(key, value);
  });
}

function hasRealFirebaseConfig(config) {
  if (!config) return false;

  return ["apiKey", "authDomain", "projectId", "appId"].every((key) => {
    const value = config[key];
    return typeof value === "string" && value.length > 0 && !value.startsWith("YOUR_");
  });
}

async function handleSignIn() {
  if (!state.auth.instance || !state.auth.provider || state.auth.busy || state.user) return;

  state.auth.busy = true;
  render();

  try {
    await signInWithPopup(state.auth.instance, state.auth.provider);
  } catch (error) {
    state.auth.message = error.message || "Sign-in failed. Check your Firebase Auth settings and allowed domains.";
  } finally {
    state.auth.busy = false;
    render();
  }
}

async function handleSignOut() {
  if (!state.auth.instance || state.auth.busy || !state.user) return;

  state.auth.busy = true;
  render();

  try {
    await signOut(state.auth.instance);
  } catch (error) {
    state.auth.message = error.message || "Sign-out failed. Refresh and try again.";
  } finally {
    state.auth.busy = false;
    render();
  }
}

function setupActions() {
  document.getElementById("sampleDataButton").addEventListener("click", () => {
    state.metrics = { ...sampleDay };
    loadStateIntoForm();
    render();
  });

  document.getElementById("examModeToggle").addEventListener("click", (event) => {
    state.examMode = !state.examMode;
    event.currentTarget.textContent = `Exam Mode: ${state.examMode ? "On" : "Off"}`;
    event.currentTarget.setAttribute("aria-pressed", String(state.examMode));
    render();
  });

  document.getElementById("authActionButton").addEventListener("click", handleSignIn);
  document.getElementById("authSignOutButton").addEventListener("click", handleSignOut);
}

async function setupFirebaseAuth() {
  const config = window.PRESENCE_IQ_FIREBASE_CONFIG;

  if (!hasRealFirebaseConfig(config)) {
    state.auth.message = "Update firebase-config.js with your Firebase web app keys, then enable Google sign-in in Firebase Auth.";
    render();
    return;
  }

  try {
    const app = initializeApp(config);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();

    await setPersistence(auth, browserLocalPersistence);

    state.auth.enabled = true;
    state.auth.ready = true;
    state.auth.instance = auth;
    state.auth.provider = provider;
    state.auth.message = "Firebase Auth is ready.";

    onAuthStateChanged(auth, (user) => {
      state.user = user;
      render();
    });
  } catch (error) {
    state.auth.message = error.message || "Firebase Auth could not initialize. Double-check your config values.";
  }

  render();
}

async function init() {
  bindInputs();
  setupActions();
  render();
  await setupFirebaseAuth();
}

init();
