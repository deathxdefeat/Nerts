"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STANDARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const DECK_PRESETS = {
  standard: {
    key: "standard",
    label: "Standard",
    subtitle: "Classic A-K face cards",
    suits: [
      { key: "clubs", symbol: "♣", stackColor: "black", inkColor: "#111111" },
      { key: "hearts", symbol: "♥", stackColor: "red", inkColor: "#cc1e1e" },
      { key: "spades", symbol: "♠", stackColor: "black", inkColor: "#111111" },
      { key: "diamonds", symbol: "♦", stackColor: "red", inkColor: "#cc1e1e" },
    ],
    ranks: STANDARD_RANKS,
  },
  rook: {
    key: "rook",
    label: "Rook",
    subtitle: "Color suits 1-14",
    suits: [
      { key: "red", symbol: "R", stackColor: "red", inkColor: "#d73d2a" },
      { key: "yellow", symbol: "Y", stackColor: "red", inkColor: "#b78000" },
      { key: "green", symbol: "G", stackColor: "black", inkColor: "#1f7a3f" },
      { key: "black", symbol: "B", stackColor: "black", inkColor: "#111111" },
    ],
    ranks: Array.from({ length: 14 }, (_, idx) => String(idx + 1)),
  },
};

function getDeckPreset(deckType) {
  return DECK_PRESETS[deckType] || DECK_PRESETS.standard;
}

const PLAYERS = [
  { id: 0, name: "You", human: true },
  { id: 1, name: "Booker", human: false },
  { id: 2, name: "Otha", human: false },
  { id: 3, name: "Sandie", human: false },
];

const LEVELS = [
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
  { key: "crazy", label: "Crazy Ninja" },
];

const AI_TICK_MS = {
  easy: 760,
  medium: 520,
  hard: 340,
  crazy: 220,
};

const AI_HESITATION = {
  easy: 0.32,
  medium: 0.2,
  hard: 0.08,
  crazy: 0.03,
};

const AI_PERSONALITY_BY_DIFFICULTY = {
  easy: ["defensive", "balanced", "balanced"],
  medium: ["balanced", "aggressive", "defensive"],
  hard: ["aggressive", "opportunist", "aggressive"],
  crazy: ["chaotic", "aggressive", "opportunist"],
};

const WORK_PILES = 5;
const NERTS_SIZE = 13;
const WIN_SCORE = 100;
const STATS_KEY = "nertz_stats_v1";
const AUDIO_SETTINGS_KEY = "nertz_audio_v1";
const SESSION_STATE_KEY = "nertz_session_v1";
const DEFAULT_STATS = {
  roundsPlayed: 0,
  roundWins: 0,
  matchesPlayed: 0,
  matchesWon: 0,
  totalRoundPoints: 0,
  bestRoundPoints: 0,
  biggestWinMargin: 0,
  gamesStarted: 0,
  totalRoundDurationMs: 0,
  fastestRoundMs: 0,
  slowestRoundMs: 0,
  currentWinStreak: 0,
  longestWinStreak: 0,
};

const DEFAULT_AUDIO_SETTINGS = {
  sfxEnabled: true,
  musicEnabled: false,
  hapticsEnabled: true,
  sfxVolume: 0.7,
  musicVolume: 0.55,
};

const MUSIC_FILE_SOURCES = [
  "https://archive.org/download/01-kavinsky-lovefoxxx-nightcall/Drive%20(Original%20Motion%20Picture%20Soundtrack)/03%20-%20College%20-%20A%20Real%20Hero%20(feat.%20Electric%20Youth).mp3",
  "https://archive.org/download/01-kavinsky-lovefoxxx-nightcall/Drive%20(Original%20Motion%20Picture%20Soundtrack)/03%20-%20College%20-%20A%20Real%20Hero%20(feat.%20Electric%20Youth).flac",
];

const SYNTH_BASS_PATTERN = [36, null, 36, null, 39, null, 36, null, 34, null, 34, null, 41, null, 34, null];
const SYNTH_LEAD_PATTERN = [null, 67, null, 71, null, 74, null, 76, null, 67, null, 66, null, 62, null, 64];
const SYNTH_ACCENT_PATTERN = [48, null, null, 50, null, null, 53, null, null, 50, null, null, 48, null, null, 46];
const MUSIC_STEP_MS = 125;

function midiToFrequency(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function clamp01(value, fallback) {
  const safe = Number.isFinite(value) ? value : fallback;
  return Math.min(1, Math.max(0, safe));
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "0:00";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function shuffle(deck) {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function createDeck(deckId, deckPreset) {
  const cards = [];
  for (const suit of deckPreset.suits) {
    for (let i = 0; i < deckPreset.ranks.length; i += 1) {
      cards.push({
        id: `${deckId}-${suit.key}-${deckPreset.ranks[i]}`,
        deckId,
        suit: suit.key,
        symbol: suit.symbol,
        color: suit.stackColor,
        inkColor: suit.inkColor,
        rank: deckPreset.ranks[i],
        value: i + 1,
      });
    }
  }
  return cards;
}

function initPlayer(playerId, deckPreset) {
  const deck = shuffle(createDeck(playerId, deckPreset));
  const nertsPile = deck.slice(0, NERTS_SIZE);
  const work = Array.from({ length: WORK_PILES }, (_, i) => [deck[NERTS_SIZE + i]]);
  const stock = deck.slice(NERTS_SIZE + WORK_PILES);
  return {
    id: playerId,
    nertsPile,
    work,
    stock,
    waste: [],
  };
}

function initFoundations(suits) {
  const foundations = {};
  for (const suit of suits) {
    foundations[suit.key] = [];
  }
  return foundations;
}

function initBoard(deckPreset) {
  return {
    players: PLAYERS.map((p) => initPlayer(p.id, deckPreset)),
    foundations: initFoundations(deckPreset.suits),
  };
}

function clonePlayers(players) {
  return players.map((p) => ({
    ...p,
    nertsPile: [...p.nertsPile],
    work: p.work.map((pile) => [...pile]),
    stock: [...p.stock],
    waste: [...p.waste],
  }));
}

function cloneFoundations(foundations) {
  const cloned = {};
  for (const [suitKey, suitPiles] of Object.entries(foundations)) {
    cloned[suitKey] = suitPiles.map((pile) => [...pile]);
  }
  return cloned;
}

function canPlayOnWork(card, pile) {
  if (!pile.length) return true;
  const top = pile[pile.length - 1];
  return card.color !== top.color && card.value === top.value - 1;
}

function isValidDescendingStack(cards) {
  if (cards.length <= 1) return true;
  for (let i = 0; i < cards.length - 1; i += 1) {
    const a = cards[i];
    const b = cards[i + 1];
    if (a.color === b.color) return false;
    if (a.value !== b.value + 1) return false;
  }
  return true;
}

function findFoundationTarget(card, foundations) {
  const suitPiles = foundations[card.suit];
  for (let i = 0; i < suitPiles.length; i += 1) {
    const pile = suitPiles[i];
    const top = pile[pile.length - 1];
    if (top && top.value === card.value - 1) {
      return { pileIndex: i, isNew: false };
    }
  }

  if (card.value === 1 && suitPiles.length < PLAYERS.length) {
    return { pileIndex: suitPiles.length, isNew: true };
  }

  return null;
}

function pushToFoundation(foundations, card, target) {
  if (target.isNew) {
    foundations[card.suit].push([card]);
    return;
  }
  foundations[card.suit][target.pileIndex].push(card);
}

function countFoundationCardsForDeck(foundations, deckId) {
  let total = 0;
  for (const suitPiles of Object.values(foundations)) {
    for (const pile of suitPiles) {
      for (const card of pile) {
        if (card.deckId === deckId) total += 1;
      }
    }
  }
  return total;
}

function getTopCards(player) {
  return {
    nerts: player.nertsPile[player.nertsPile.length - 1] || null,
    waste: player.waste[player.waste.length - 1] || null,
    work: player.work.map((pile) => pile[pile.length - 1] || null),
  };
}

function drawForPlayer(player) {
  if (player.stock.length) {
    player.waste.push(player.stock.pop());
    return;
  }
  if (player.waste.length) {
    player.stock = [...player.waste].reverse();
    player.waste = [];
  }
}

function getAiPersonality(difficulty, aiIndex) {
  const list = AI_PERSONALITY_BY_DIFFICULTY[difficulty] || AI_PERSONALITY_BY_DIFFICULTY.medium;
  return list[aiIndex - 1] || "balanced";
}

function tryAiMove(players, foundations, aiIndex, options) {
  const { allowWorkShuffle, personality = "balanced" } = options;
  const nextPlayers = clonePlayers(players);
  const nextFoundations = cloneFoundations(foundations);
  const ai = nextPlayers[aiIndex];

  const currentTop = (source, workIndex) => {
    if (source === "nerts") return ai.nertsPile[ai.nertsPile.length - 1] || null;
    if (source === "waste") return ai.waste[ai.waste.length - 1] || null;
    return ai.work[workIndex]?.[ai.work[workIndex].length - 1] || null;
  };

  const pullFrom = (source, workIndex) => {
    if (source === "nerts") return ai.nertsPile.pop() || null;
    if (source === "waste") return ai.waste.pop() || null;
    return ai.work[workIndex].pop() || null;
  };

  const finalize = () => ({
    players: nextPlayers,
    foundations: nextFoundations,
    winnerId: ai.nertsPile.length ? null : aiIndex,
  });

  const tryFoundationFrom = (source, workIndex) => {
    const card = currentTop(source, workIndex);
    if (!card) return false;
    const target = findFoundationTarget(card, nextFoundations);
    if (!target) return false;
    const moved = pullFrom(source, workIndex);
    if (!moved) return false;
    pushToFoundation(nextFoundations, moved, target);
    return true;
  };

  const tryWorkFrom = (source, workIndex) => {
    const card = currentTop(source, workIndex);
    if (!card) return false;
    for (let target = 0; target < WORK_PILES; target += 1) {
      if (source === "work" && target === workIndex) continue;
      if (!canPlayOnWork(card, ai.work[target])) continue;
      const moved = pullFrom(source, workIndex);
      if (!moved) return false;
      ai.work[target].push(moved);
      return true;
    }
    return false;
  };

  const operations = {
    nertsToFoundation: () => tryFoundationFrom("nerts"),
    wasteToFoundation: () => tryFoundationFrom("waste"),
    anyWorkToFoundation: () => {
      for (let w = 0; w < WORK_PILES; w += 1) {
        if (tryFoundationFrom("work", w)) return true;
      }
      return false;
    },
    nertsToWork: () => tryWorkFrom("nerts"),
    wasteToWork: () => tryWorkFrom("waste"),
    anyWorkToWork: () => {
      if (!allowWorkShuffle) return false;
      for (let w = 0; w < WORK_PILES; w += 1) {
        if (tryWorkFrom("work", w)) return true;
      }
      return false;
    },
    draw: () => {
      drawForPlayer(ai);
      return true;
    },
  };

  const personalityOrders = {
    aggressive: [
      "nertsToFoundation",
      "nertsToWork",
      "anyWorkToFoundation",
      "wasteToFoundation",
      "wasteToWork",
      "anyWorkToWork",
      "draw",
    ],
    defensive: [
      "anyWorkToFoundation",
      "wasteToFoundation",
      "wasteToWork",
      "nertsToFoundation",
      "anyWorkToWork",
      "nertsToWork",
      "draw",
    ],
    opportunist: [
      "wasteToFoundation",
      "anyWorkToFoundation",
      "nertsToFoundation",
      "anyWorkToWork",
      "wasteToWork",
      "nertsToWork",
      "draw",
    ],
    balanced: [
      "nertsToFoundation",
      "wasteToFoundation",
      "anyWorkToFoundation",
      "nertsToWork",
      "wasteToWork",
      "anyWorkToWork",
      "draw",
    ],
  };

  const baseOrder = personalityOrders[personality] || personalityOrders.balanced;
  const order =
    personality === "chaotic"
      ? [...shuffle(baseOrder.filter((step) => step !== "draw")), "draw"]
      : baseOrder;

  for (const step of order) {
    const op = operations[step];
    if (!op) continue;
    if (!op()) continue;
    return finalize();
  }

  operations.draw();
  return finalize();
}

function PlayingCard({
  card,
  onClick,
  faceDown = false,
  selected = false,
  small = false,
  compact = false,
  rotate = 0,
  draggable = false,
  onDragStart,
  onDragEnd,
  onPointerDown,
}) {
  const width = small ? (compact ? 44 : 54) : (compact ? 58 : 74);
  const height = small ? (compact ? 62 : 76) : (compact ? 84 : 104);
  const cornerRadius = compact ? 7 : 10;

  if (faceDown) {
    return (
      <button
        type="button"
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onPointerDown={onPointerDown}
        style={{
          width,
          height,
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: cornerRadius,
          cursor: draggable ? "grab" : onClick ? "pointer" : "default",
          background:
            "radial-gradient(120px 80px at 85% 0%, rgba(101,189,255,0.26), transparent 55%), linear-gradient(155deg, #2a3f62 0%, #1f3252 52%, #172743 100%)",
          boxShadow:
            "0 8px 20px rgba(1,7,20,0.38), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.28)",
          transform: `rotate(${rotate}deg)`,
          padding: 0,
          touchAction: draggable ? "none" : "manipulation",
        }}
      />
    );
  }

  if (!card) {
    return (
      <button
        type="button"
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onPointerDown={onPointerDown}
        style={{
          width,
          height,
          border: "1px dashed rgba(193,221,255,0.45)",
          background: "rgba(24,40,64,0.38)",
          borderRadius: cornerRadius,
          cursor: draggable ? "grab" : onClick ? "pointer" : "default",
          color: "rgba(204,226,255,0.62)",
          fontSize: compact ? 20 : 24,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
          touchAction: draggable ? "none" : "manipulation",
        }}
      >
        ·
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onPointerDown={onPointerDown}
      style={{
        width,
        height,
        border: selected ? "2px solid #8ec8ff" : "1px solid rgba(44,62,86,0.4)",
        borderRadius: cornerRadius,
        cursor: draggable ? "grab" : onClick ? "pointer" : "default",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(244,248,255,0.98) 52%, rgba(236,243,253,0.98) 100%)",
        color: card.inkColor || (card.color === "red" ? "#cc1e1e" : "#111111"),
        boxShadow: selected
          ? "0 0 0 3px rgba(142,200,255,0.3), 0 9px 20px rgba(4,11,24,0.32)"
          : "0 7px 18px rgba(4,11,24,0.26), inset 0 1px 0 rgba(255,255,255,0.66)",
        transform: `rotate(${rotate}deg)`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: compact ? "3px 4px" : "4px 5px",
        transition: "box-shadow 120ms ease, transform 120ms ease",
        touchAction: draggable ? "none" : "manipulation",
      }}
    >
      <div style={{ textAlign: "left", lineHeight: 1, letterSpacing: small ? 0 : 0.1 }}>
        <div style={{ fontSize: small ? (compact ? 12 : 14) : compact ? 15 : 18, fontWeight: 700 }}>{card.rank}</div>
        <div style={{ fontSize: small ? (compact ? 10 : 12) : compact ? 13 : 16, marginTop: -1, opacity: 0.92 }}>{card.symbol}</div>
      </div>
      <div style={{ fontSize: small ? (compact ? 14 : 18) : compact ? 22 : 28, opacity: 0.8 }}>{card.symbol}</div>
    </button>
  );
}

function FoundationGrid({ foundations, suits, compact = false, onCellClick, selectedCard, onCellDrop, onCellDragOver, activeSuit }) {
  return (
    <div
      style={{
        margin: compact ? "8px auto 10px" : "10px auto 14px",
        width: compact ? "min(540px, 98vw)" : "min(560px, 94vw)",
        padding: compact ? "6px" : "8px",
        background: "rgba(255,255,255,0.16)",
        borderRadius: 4,
        border: "1px solid rgba(255,255,255,0.2)",
      }}
    >
      {Array.from({ length: PLAYERS.length }).map((_, rowIdx) => (
        <div key={rowIdx} style={{ display: "grid", gridTemplateColumns: `repeat(${suits.length}, 1fr)`, gap: compact ? 3 : 4, marginBottom: rowIdx === PLAYERS.length - 1 ? 0 : compact ? 3 : 4 }}>
          {suits.map((suit) => {
            const pile = foundations[suit.key][rowIdx];
            const top = pile?.[pile.length - 1] || null;
            return (
              <button
                key={`${rowIdx}-${suit.key}`}
                type="button"
                data-drop-type="foundation"
                data-drop-suit={suit.key}
                onClick={() => onCellClick(suit.key)}
                onDragOver={(e) => onCellDragOver(e, suit.key)}
                onDrop={(e) => {
                  e.preventDefault();
                  onCellDrop(suit.key);
                }}
                style={{
                  height: compact ? 44 : 52,
                  border:
                    activeSuit === suit.key
                      ? "2px solid rgba(125, 186, 255, 0.95)"
                      : selectedCard
                        ? "1px solid rgba(90, 146, 255, 0.6)"
                        : "1px solid rgba(255,255,255,0.2)",
                  background: activeSuit === suit.key ? "rgba(120, 183, 255, 0.22)" : "rgba(255,255,255,0.08)",
                  color: suit.inkColor || (suit.stackColor === "red" ? "#cf3030" : "#3a2010"),
                  fontSize: compact ? 20 : 26,
                  borderRadius: 3,
                  cursor: selectedCard ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: compact ? 2 : 4,
                  touchAction: "manipulation",
                }}
              >
                {top ? (
                  <>
                    <span style={{ fontSize: compact ? 17 : 22, fontWeight: 700 }}>{top.rank}</span>
                    <span>{top.symbol}</span>
                  </>
                ) : (
                  <span style={{ opacity: 0.55 }}>{suit.symbol}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function labelForSource(source, idx) {
  if (source === "nerts") return "NERTS";
  if (source === "waste") return "WASTE";
  return `WORK ${idx + 1}`;
}

function getHumanSelectedCard(human, selected) {
  if (!selected) return null;
  if (selected.source === "nerts") return human.nertsPile[human.nertsPile.length - 1] || null;
  if (selected.source === "waste") return human.waste[human.waste.length - 1] || null;
  const pile = human.work[selected.workIndex];
  if (!pile.length) return null;
  const fallback = pile.length - 1;
  const index = Number.isInteger(selected.stackStart) ? selected.stackStart : fallback;
  return pile[Math.max(0, Math.min(index, fallback))] || null;
}

const woodBackground = {
  minHeight: "100vh",
  color: "#ffffff",
  fontFamily: "'Avenir Next', 'Trebuchet MS', sans-serif",
  backgroundImage:
    "radial-gradient(1100px 600px at 12% -8%, rgba(82, 172, 255, 0.28), transparent 58%), radial-gradient(900px 540px at 88% -16%, rgba(37, 206, 178, 0.2), transparent 56%), linear-gradient(160deg, #0b1220 0%, #121d33 46%, #1a2b42 100%)",
  backgroundColor: "#0b1220",
};

export default function NertsGame() {
  const [screen, setScreen] = useState("menu");
  const [difficulty, setDifficulty] = useState("medium");
  const [deckType, setDeckType] = useState("standard");
  const [roundNumber, setRoundNumber] = useState(1);
  const [scores, setScores] = useState([0, 0, 0, 0]);
  const [board, setBoard] = useState(null);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [roundResult, setRoundResult] = useState(null);
  const [dragPayload, setDragPayload] = useState(null);
  const [dragOverSuit, setDragOverSuit] = useState(null);
  const [dragOverWork, setDragOverWork] = useState(null);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const [hint, setHint] = useState(null);
  const [touchDrag, setTouchDrag] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [audioSettings, setAudioSettings] = useState(DEFAULT_AUDIO_SETTINGS);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const boardRef = useRef(board);
  const scoresRef = useRef(scores);
  const screenRef = useRef(screen);
  const selectedRef = useRef(selected);
  const touchDragRef = useRef(touchDrag);
  const isPausedRef = useRef(isPaused);
  const messageTimeoutRef = useRef(null);
  const aiCursorRef = useRef(1);
  const roundStartMsRef = useRef(null);
  const pauseStartedMsRef = useRef(null);
  const pausedDurationMsRef = useRef(0);
  const audioSettingsRef = useRef(audioSettings);
  const audioRef = useRef({
    ctx: null,
    masterGain: null,
    sfxGain: null,
    musicGain: null,
    musicAudio: null,
    musicSourceIndex: 0,
    musicTimer: null,
    musicStep: 0,
    musicMode: "idle",
  });

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    touchDragRef.current = touchDrag;
  }, [touchDrag]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    audioSettingsRef.current = audioSettings;
  }, [audioSettings]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STATS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setStats((prev) => ({ ...prev, ...parsed }));
    } catch {
      // Ignore corrupted local stats and continue with defaults.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {
      // Ignore storage write failures.
    }
  }, [stats]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AUDIO_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setAudioSettings((prev) => ({
        ...prev,
        ...parsed,
        sfxVolume: clamp01(parsed?.sfxVolume, prev.sfxVolume),
        musicVolume: clamp01(parsed?.musicVolume, prev.musicVolume),
        hapticsEnabled: parsed?.hapticsEnabled ?? prev.hapticsEnabled,
      }));
    } catch {
      // Ignore corrupted audio settings and continue with defaults.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(audioSettings));
    } catch {
      // Ignore storage write failures.
    }
  }, [audioSettings]);

  useEffect(() => {
    try {
      setHasSavedSession(Boolean(window.localStorage.getItem(SESSION_STATE_KEY)));
    } catch {
      setHasSavedSession(false);
    }
  }, []);

  const ensureAudioEngine = useCallback(() => {
    if (typeof window === "undefined") return null;
    let runtime = audioRef.current;
    let ctx = runtime.ctx;
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      ctx = new AudioContextClass();
      const masterGain = ctx.createGain();
      const sfxGain = ctx.createGain();
      const musicGain = ctx.createGain();
      const sfxVolume = clamp01(audioSettingsRef.current?.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume);
      const musicVolume = clamp01(audioSettingsRef.current?.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume);
      masterGain.gain.setValueAtTime(0.72, ctx.currentTime);
      sfxGain.gain.setValueAtTime(0.08 + sfxVolume * 0.46, ctx.currentTime);
      musicGain.gain.setValueAtTime(0.03 + musicVolume * 0.28, ctx.currentTime);
      sfxGain.connect(masterGain);
      musicGain.connect(masterGain);
      masterGain.connect(ctx.destination);
      runtime = {
        ...runtime,
        ctx,
        masterGain,
        sfxGain,
        musicGain,
      };
      audioRef.current = runtime;
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }, []);

  useEffect(() => {
    const runtime = audioRef.current;
    const sfxVolume = clamp01(audioSettings.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume);
    const musicVolume = clamp01(audioSettings.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume);
    if (runtime.ctx) {
      const now = runtime.ctx.currentTime;
      runtime.sfxGain?.gain.setTargetAtTime(0.08 + sfxVolume * 0.46, now, 0.02);
      runtime.musicGain?.gain.setTargetAtTime(0.03 + musicVolume * 0.28, now, 0.02);
    }
    if (runtime.musicAudio) {
      runtime.musicAudio.volume = musicVolume;
    }
  }, [audioSettings.musicVolume, audioSettings.sfxVolume]);

  const scheduleTone = useCallback((config) => {
    const ctx = ensureAudioEngine();
    if (!ctx) return;
    const runtime = audioRef.current;
    const targetGain = config.target === "music" ? runtime.musicGain : runtime.sfxGain;
    if (!targetGain) return;

    const start = ctx.currentTime + (config.startMs || 0) / 1000;
    const duration = Math.max(0.02, (config.durationMs || 90) / 1000);
    const attack = Math.max(0.002, (config.attackMs ?? 6) / 1000);
    const release = Math.max(0.006, (config.releaseMs ?? 45) / 1000);
    const stopAt = start + duration + 0.03;

    const oscillator = ctx.createOscillator();
    const amp = ctx.createGain();
    oscillator.type = config.type || "square";
    oscillator.frequency.setValueAtTime(Math.max(20, config.freq || 440), start);
    if (config.slideTo && config.slideTo > 0) {
      oscillator.frequency.exponentialRampToValueAtTime(config.slideTo, start + duration);
    }
    if (config.detune) oscillator.detune.setValueAtTime(config.detune, start);

    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(config.volume ?? 0.12, start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, Math.max(start + attack + 0.006, start + duration - release));

    oscillator.connect(amp);

    if (config.filterHz) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(config.filterHz, start);
      if (config.filterEndHz) {
        filter.frequency.linearRampToValueAtTime(config.filterEndHz, start + duration);
      }
      filter.Q.setValueAtTime(config.filterQ ?? 0.8, start);
      amp.connect(filter);
      filter.connect(targetGain);
    } else {
      amp.connect(targetGain);
    }

    oscillator.start(start);
    oscillator.stop(stopAt);
  }, [ensureAudioEngine]);

  const triggerHaptic = useCallback((kind = "tap") => {
    if (!audioSettingsRef.current.hapticsEnabled) return;
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (kind === "error") {
      navigator.vibrate([18, 30, 18]);
      return;
    }
    if (kind === "roundWin") {
      navigator.vibrate([15, 24, 28]);
      return;
    }
    if (kind === "roundLose") {
      navigator.vibrate([20, 40, 14, 40, 20]);
      return;
    }
    if (kind === "auto" || kind === "hint") {
      navigator.vibrate([10, 14, 10]);
      return;
    }
    navigator.vibrate(10);
  }, []);

  const playSfx = useCallback((kind = "tap") => {
    triggerHaptic(kind);
    if (!audioSettingsRef.current.sfxEnabled) return;
    if (kind === "tap") {
      scheduleTone({ freq: 880, durationMs: 55, volume: 0.09, type: "square" });
      return;
    }
    if (kind === "place") {
      scheduleTone({ freq: 660, durationMs: 52, volume: 0.09, type: "square" });
      scheduleTone({ startMs: 58, freq: 988, durationMs: 68, volume: 0.08, type: "square" });
      return;
    }
    if (kind === "draw") {
      scheduleTone({ freq: 440, durationMs: 72, volume: 0.08, type: "square" });
      scheduleTone({ startMs: 78, freq: 554, durationMs: 82, volume: 0.08, type: "triangle" });
      return;
    }
    if (kind === "error") {
      scheduleTone({ freq: 260, slideTo: 140, durationMs: 140, volume: 0.12, type: "sawtooth", releaseMs: 70 });
      return;
    }
    if (kind === "hint") {
      scheduleTone({ freq: 784, durationMs: 68, volume: 0.07, type: "triangle" });
      scheduleTone({ startMs: 74, freq: 1175, durationMs: 74, volume: 0.06, type: "triangle" });
      return;
    }
    if (kind === "auto") {
      scheduleTone({ freq: 659, durationMs: 64, volume: 0.07, type: "square" });
      scheduleTone({ startMs: 72, freq: 784, durationMs: 64, volume: 0.07, type: "square" });
      scheduleTone({ startMs: 144, freq: 988, durationMs: 84, volume: 0.08, type: "square" });
      return;
    }
    if (kind === "undo") {
      scheduleTone({ freq: 587, durationMs: 68, volume: 0.08, type: "triangle" });
      scheduleTone({ startMs: 74, freq: 392, durationMs: 90, volume: 0.08, type: "triangle" });
      return;
    }
    if (kind === "start") {
      scheduleTone({ freq: 523, durationMs: 68, volume: 0.08, type: "square" });
      scheduleTone({ startMs: 78, freq: 659, durationMs: 68, volume: 0.08, type: "square" });
      scheduleTone({ startMs: 156, freq: 784, durationMs: 92, volume: 0.08, type: "square" });
      return;
    }
    if (kind === "roundWin") {
      scheduleTone({ freq: 523, durationMs: 82, volume: 0.09, type: "square" });
      scheduleTone({ startMs: 94, freq: 659, durationMs: 84, volume: 0.09, type: "square" });
      scheduleTone({ startMs: 186, freq: 784, durationMs: 86, volume: 0.09, type: "square" });
      scheduleTone({ startMs: 278, freq: 1047, durationMs: 130, volume: 0.1, type: "triangle" });
      return;
    }
    if (kind === "roundLose") {
      scheduleTone({ freq: 349, durationMs: 92, volume: 0.09, type: "square" });
      scheduleTone({ startMs: 98, freq: 294, durationMs: 110, volume: 0.09, type: "square" });
      scheduleTone({ startMs: 212, freq: 220, durationMs: 150, volume: 0.09, type: "triangle" });
    }
  }, [scheduleTone, triggerHaptic]);

  const playMusicStep = useCallback((step) => {
    const bassMidi = SYNTH_BASS_PATTERN[step % SYNTH_BASS_PATTERN.length];
    if (bassMidi !== null) {
      const bassFreq = midiToFrequency(bassMidi);
      scheduleTone({
        target: "music",
        freq: bassFreq,
        durationMs: 210,
        volume: 0.065,
        type: "sawtooth",
        filterHz: 980,
        filterEndHz: 420,
        filterQ: 1.2,
        attackMs: 4,
        releaseMs: 90,
      });
      scheduleTone({
        target: "music",
        freq: bassFreq / 2,
        durationMs: 190,
        volume: 0.035,
        type: "square",
        filterHz: 520,
        filterEndHz: 260,
        attackMs: 4,
        releaseMs: 90,
      });
    }

    const leadMidi = SYNTH_LEAD_PATTERN[step % SYNTH_LEAD_PATTERN.length];
    if (leadMidi !== null) {
      scheduleTone({
        target: "music",
        freq: midiToFrequency(leadMidi),
        durationMs: 116,
        volume: 0.04,
        type: "square",
        filterHz: 2400,
        filterEndHz: 1200,
        filterQ: 0.7,
        attackMs: 3,
        releaseMs: 55,
      });
    }

    const accentMidi = SYNTH_ACCENT_PATTERN[step % SYNTH_ACCENT_PATTERN.length];
    if (accentMidi !== null) {
      scheduleTone({
        target: "music",
        freq: midiToFrequency(accentMidi),
        durationMs: 85,
        volume: 0.028,
        type: "triangle",
        filterHz: 1600,
        filterEndHz: 900,
        attackMs: 2,
        releaseMs: 40,
      });
    }
  }, [scheduleTone]);

  const stopSynthMusic = useCallback(() => {
    const runtime = audioRef.current;
    if (runtime.musicTimer) {
      window.clearInterval(runtime.musicTimer);
      runtime.musicTimer = null;
    }
    runtime.musicStep = 0;
  }, []);

  const startSynthMusic = useCallback(() => {
    const ctx = ensureAudioEngine();
    if (!ctx) return;
    const runtime = audioRef.current;
    if (runtime.musicTimer) return;
    runtime.musicMode = "synth";
    runtime.musicStep = 0;
    runtime.musicTimer = window.setInterval(() => {
      if (!audioSettingsRef.current.musicEnabled) return;
      playMusicStep(runtime.musicStep);
      runtime.musicStep = (runtime.musicStep + 1) % SYNTH_BASS_PATTERN.length;
    }, MUSIC_STEP_MS);
  }, [ensureAudioEngine, playMusicStep]);

  const stopMusic = useCallback(() => {
    const runtime = audioRef.current;
    stopSynthMusic();
    if (runtime.musicAudio) {
      runtime.musicAudio.pause();
      runtime.musicAudio.currentTime = 0;
    }
    runtime.musicMode = "idle";
  }, [stopSynthMusic]);

  const startMusic = useCallback(() => {
    ensureAudioEngine();
    const runtime = audioRef.current;
    stopSynthMusic();

    if (!runtime.musicAudio) {
      const musicAudio = new Audio();
      musicAudio.loop = true;
      musicAudio.preload = "auto";
      musicAudio.crossOrigin = "anonymous";
      runtime.musicAudio = musicAudio;
    }

    const musicAudio = runtime.musicAudio;
    musicAudio.volume = clamp01(audioSettingsRef.current.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume);

    const startSynthFallback = () => {
      if (!audioSettingsRef.current.musicEnabled) return;
      runtime.musicSourceIndex = 0;
      runtime.musicMode = "synth";
      musicAudio.pause();
      musicAudio.removeAttribute("src");
      musicAudio.load();
      startSynthMusic();
    };

    const playSourceAt = (index) => {
      if (!audioSettingsRef.current.musicEnabled) return;
      if (index >= MUSIC_FILE_SOURCES.length) {
        startSynthFallback();
        return;
      }
      runtime.musicSourceIndex = index;
      musicAudio.src = MUSIC_FILE_SOURCES[index];
      musicAudio.currentTime = 0;
      const playResult = musicAudio.play();
      if (playResult && typeof playResult.then === "function") {
        playResult
          .then(() => {
            if (!audioSettingsRef.current.musicEnabled) {
              musicAudio.pause();
              return;
            }
            runtime.musicMode = "file";
          })
          .catch(() => {
            playSourceAt(index + 1);
          });
        return;
      }
      runtime.musicMode = "file";
    };

    playSourceAt(0);
  }, [ensureAudioEngine, startSynthMusic, stopSynthMusic]);

  useEffect(() => {
    if (audioSettings.musicEnabled) {
      startMusic();
    } else {
      stopMusic();
    }
  }, [audioSettings.musicEnabled, startMusic, stopMusic]);

  useEffect(() => {
    return () => {
      stopMusic();
      const runtime = audioRef.current;
      if (runtime.musicAudio) {
        runtime.musicAudio.pause();
        runtime.musicAudio.removeAttribute("src");
        runtime.musicAudio.load();
        runtime.musicAudio = null;
      }
      if (runtime.ctx && runtime.ctx.state !== "closed") {
        runtime.ctx.close().catch(() => {});
      }
    };
  }, [stopMusic]);

  const toggleSfx = useCallback(() => {
    ensureAudioEngine();
    const turningOn = !audioSettingsRef.current.sfxEnabled;
    setAudioSettings((prev) => {
      const next = { ...prev, sfxEnabled: !prev.sfxEnabled };
      audioSettingsRef.current = next;
      return next;
    });
    if (turningOn) {
      scheduleTone({ freq: 988, durationMs: 64, volume: 0.08, type: "square" });
      scheduleTone({ startMs: 70, freq: 1319, durationMs: 74, volume: 0.08, type: "square" });
      return;
    }
    scheduleTone({ freq: 260, slideTo: 180, durationMs: 96, volume: 0.08, type: "triangle" });
  }, [ensureAudioEngine, scheduleTone]);

  const toggleMusic = useCallback(() => {
    ensureAudioEngine();
    const turningOn = !audioSettingsRef.current.musicEnabled;
    setAudioSettings((prev) => {
      const next = { ...prev, musicEnabled: !prev.musicEnabled };
      audioSettingsRef.current = next;
      return next;
    });
    if (audioSettingsRef.current.sfxEnabled) {
      playSfx(turningOn ? "start" : "undo");
    }
  }, [ensureAudioEngine, playSfx]);

  const toggleHaptics = useCallback(() => {
    ensureAudioEngine();
    const turningOn = !audioSettingsRef.current.hapticsEnabled;
    setAudioSettings((prev) => {
      const next = { ...prev, hapticsEnabled: !prev.hapticsEnabled };
      audioSettingsRef.current = next;
      return next;
    });
    if (turningOn) {
      triggerHaptic("tap");
    }
    if (audioSettingsRef.current.sfxEnabled) {
      playSfx(turningOn ? "tap" : "undo");
    }
  }, [ensureAudioEngine, playSfx, triggerHaptic]);

  const updateSfxVolume = useCallback((event) => {
    const nextVolume = clamp01(Number(event.target.value) / 100, DEFAULT_AUDIO_SETTINGS.sfxVolume);
    setAudioSettings((prev) => {
      const next = { ...prev, sfxVolume: nextVolume };
      audioSettingsRef.current = next;
      return next;
    });
  }, []);

  const updateMusicVolume = useCallback((event) => {
    const nextVolume = clamp01(Number(event.target.value) / 100, DEFAULT_AUDIO_SETTINGS.musicVolume);
    setAudioSettings((prev) => {
      const next = { ...prev, musicVolume: nextVolume };
      audioSettingsRef.current = next;
      return next;
    });
  }, []);

  const pushMessage = useCallback((text) => {
    clearTimeout(messageTimeoutRef.current);
    setMessage(text);
    messageTimeoutRef.current = setTimeout(() => setMessage(""), 1000);
  }, []);

  useEffect(() => {
    return () => clearTimeout(messageTimeoutRef.current);
  }, []);

  const clearSavedSession = useCallback(() => {
    try {
      window.localStorage.removeItem(SESSION_STATE_KEY);
    } catch {
      // Ignore storage write failures.
    }
    setHasSavedSession(false);
  }, []);

  const pauseRound = useCallback((reason = "Paused") => {
    if (screenRef.current !== "playing") return;
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    pauseStartedMsRef.current = Date.now();
    setIsPaused(true);
    setTouchDrag(null);
    setDragPayload(null);
    setDragOverSuit(null);
    setDragOverWork(null);
    pushMessage(reason);
  }, [pushMessage]);

  const resumeRound = useCallback(() => {
    if (screenRef.current !== "playing") return;
    if (!isPausedRef.current) return;
    if (pauseStartedMsRef.current) {
      pausedDurationMsRef.current += Math.max(0, Date.now() - pauseStartedMsRef.current);
      pauseStartedMsRef.current = null;
    }
    isPausedRef.current = false;
    setIsPaused(false);
    playSfx("tap");
    pushMessage("Back in play");
  }, [playSfx, pushMessage]);

  const resumeSavedSession = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_STATE_KEY);
      if (!raw) {
        setHasSavedSession(false);
        pushMessage("No saved session");
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed?.board || !Array.isArray(parsed?.scores) || parsed.scores.length !== PLAYERS.length) {
        clearSavedSession();
        pushMessage("Saved session unavailable");
        return;
      }
      const nextDeckType = typeof parsed.deckType === "string" && DECK_PRESETS[parsed.deckType] ? parsed.deckType : "standard";
      const nextDifficulty = typeof parsed.difficulty === "string" && AI_TICK_MS[parsed.difficulty]
        ? parsed.difficulty
        : "medium";
      const nextRoundNumber = Number.isFinite(parsed.roundNumber) ? Math.max(1, Math.floor(parsed.roundNumber)) : 1;
      const nextScores = parsed.scores.map((score) => (Number.isFinite(score) ? score : 0));
      const nextScreen = ["round", "playing", "roundOver"].includes(parsed.screen) ? parsed.screen : "round";
      const nextSelection = parsed.selected || null;

      setDeckType(nextDeckType);
      setDifficulty(nextDifficulty);
      setRoundNumber(nextRoundNumber);
      scoresRef.current = nextScores;
      setScores(nextScores);
      boardRef.current = parsed.board;
      setBoard(parsed.board);
      setRoundResult(parsed.roundResult || null);
      setScreen(nextScreen);
      setSelected(nextSelection);
      selectedRef.current = nextSelection;
      setDragPayload(null);
      setDragOverSuit(null);
      setDragOverWork(null);
      setUndoSnapshot(null);
      setHint(null);
      setTouchDrag(null);
      setShowRules(false);
      roundStartMsRef.current = Number.isFinite(parsed.roundStartMs) ? parsed.roundStartMs : null;
      pausedDurationMsRef.current = Number.isFinite(parsed.pausedDurationMs)
        ? Math.max(0, parsed.pausedDurationMs)
        : 0;
      pauseStartedMsRef.current = null;
      if (nextScreen === "playing" && !roundStartMsRef.current) {
        roundStartMsRef.current = Date.now();
      }

      if (nextScreen === "playing") {
        isPausedRef.current = true;
        setIsPaused(true);
        pushMessage("Session resumed (paused)");
      } else {
        isPausedRef.current = false;
        setIsPaused(false);
        pushMessage("Session resumed");
      }
      setHasSavedSession(true);
    } catch {
      clearSavedSession();
      pushMessage("Saved session unavailable");
    }
  }, [clearSavedSession, pushMessage]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onVisibilityChange = () => {
      if (!document.hidden) return;
      pauseRound("Paused while app inactive");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [pauseRound]);

  const deckPreset = getDeckPreset(deckType);
  const isCompact = viewportWidth <= 760;
  const isPhone = viewportWidth <= 520;
  const mainCardWidth = isCompact ? 58 : 74;
  const mainCardHeight = isCompact ? 84 : 104;
  const workFanOffset = isCompact ? 16 : 20;
  const workVisibleCount = isCompact ? 6 : 7;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!board) return;
    if (!["round", "playing", "roundOver"].includes(screen)) return;
    const sessionPayload = {
      board,
      screen,
      deckType,
      difficulty,
      roundNumber,
      scores,
      roundResult,
      selected,
      roundStartMs: roundStartMsRef.current,
      pausedDurationMs: pausedDurationMsRef.current,
      savedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(sessionPayload));
      setHasSavedSession(true);
    } catch {
      // Ignore storage write failures.
    }
  }, [board, deckType, difficulty, roundNumber, roundResult, screen, scores, selected]);

  const prepareRound = useCallback((nextDifficulty, resetScores = false) => {
    ensureAudioEngine();
    playSfx("start");
    const built = initBoard(deckPreset);
    boardRef.current = built;
    setBoard(built);
    setSelected(null);
    selectedRef.current = null;
    setRoundResult(null);
    setDifficulty(nextDifficulty);
    setDragPayload(null);
    setDragOverSuit(null);
    setDragOverWork(null);
    setUndoSnapshot(null);
    setHint(null);
    setTouchDrag(null);
    aiCursorRef.current = 1;
    roundStartMsRef.current = null;
    pauseStartedMsRef.current = null;
    pausedDurationMsRef.current = 0;
    isPausedRef.current = false;
    setIsPaused(false);

    if (resetScores) {
      scoresRef.current = [0, 0, 0, 0];
      setScores([0, 0, 0, 0]);
      setRoundNumber(1);
      setStats((prev) => ({ ...prev, gamesStarted: prev.gamesStarted + 1 }));
    }

    setScreen("round");
  }, [deckPreset, ensureAudioEngine, playSfx]);

  const endRound = useCallback((winnerId, boardSnapshot) => {
    if (screenRef.current !== "playing") return;

    const foundationCounts = PLAYERS.map((p) => countFoundationCardsForDeck(boardSnapshot.foundations, p.id));
    const nertsLeft = boardSnapshot.players.map((p) => p.nertsPile.length);
    const roundPoints = foundationCounts.map((f, idx) => f - nertsLeft[idx] * 2);
    const totals = scoresRef.current.map((s, idx) => s + roundPoints[idx]);
    const now = Date.now();
    const activePauseMs = pauseStartedMsRef.current ? Math.max(0, now - pauseStartedMsRef.current) : 0;
    const roundDurationMs = roundStartMsRef.current
      ? Math.max(0, now - roundStartMsRef.current - pausedDurationMsRef.current - activePauseMs)
      : 0;
    roundStartMsRef.current = null;
    pauseStartedMsRef.current = null;
    pausedDurationMsRef.current = 0;
    isPausedRef.current = false;
    setIsPaused(false);

    scoresRef.current = totals;
    setScores(totals);
    const playerRoundPoints = roundPoints[0];
    const bestOpponentRound = Math.max(...roundPoints.slice(1));
    setStats((prev) => ({
      ...prev,
      roundsPlayed: prev.roundsPlayed + 1,
      roundWins: prev.roundWins + (winnerId === 0 ? 1 : 0),
      totalRoundPoints: prev.totalRoundPoints + playerRoundPoints,
      bestRoundPoints: Math.max(prev.bestRoundPoints, playerRoundPoints),
      biggestWinMargin: Math.max(prev.biggestWinMargin, playerRoundPoints - bestOpponentRound),
      totalRoundDurationMs: prev.totalRoundDurationMs + roundDurationMs,
      fastestRoundMs:
        prev.fastestRoundMs === 0 ? roundDurationMs : Math.min(prev.fastestRoundMs, roundDurationMs || prev.fastestRoundMs),
      slowestRoundMs: Math.max(prev.slowestRoundMs, roundDurationMs),
      currentWinStreak: winnerId === 0 ? prev.currentWinStreak + 1 : 0,
      longestWinStreak: winnerId === 0 ? Math.max(prev.longestWinStreak, prev.currentWinStreak + 1) : prev.longestWinStreak,
    }));
    setSelected(null);
    selectedRef.current = null;
    setDragPayload(null);
    setDragOverSuit(null);
    setDragOverWork(null);
    setTouchDrag(null);
    setUndoSnapshot(null);
    setHint(null);
    setRoundResult({ winnerId, roundPoints, totals, foundationCounts, nertsLeft, roundDurationMs });
    setScreen("roundOver");
    playSfx(winnerId === 0 ? "roundWin" : "roundLose");
  }, [playSfx]);

  useEffect(() => {
    if (screen !== "playing" || isPaused) return;

    const timer = setInterval(() => {
      const current = boardRef.current;
      if (!current) return;
      if (touchDragRef.current) return;
      if (isPausedRef.current) return;

      const aiIndex = aiCursorRef.current;
      aiCursorRef.current = aiCursorRef.current >= PLAYERS.length - 1 ? 1 : aiCursorRef.current + 1;

      if (Math.random() < (AI_HESITATION[difficulty] || 0.15)) {
        return;
      }

      const aiResult = tryAiMove(
        current.players,
        current.foundations,
        aiIndex,
        {
          allowWorkShuffle: difficulty === "hard" || difficulty === "crazy",
          personality: getAiPersonality(difficulty, aiIndex),
        },
      );
      const nextBoard = { players: aiResult.players, foundations: aiResult.foundations };
      boardRef.current = nextBoard;
      setBoard(nextBoard);
      setUndoSnapshot(null);

      if (aiResult.winnerId !== null) {
        endRound(aiResult.winnerId, nextBoard);
      }
    }, AI_TICK_MS[difficulty] || AI_TICK_MS.medium);

    return () => clearInterval(timer);
  }, [difficulty, endRound, isPaused, screen]);

  const human = board?.players?.[0] || null;
  const selectedCard = human && selected ? getHumanSelectedCard(human, selected) : null;

  const selectFromSource = (source, workIndex = null, stackStart = null) => {
    if (screen !== "playing" || isPausedRef.current || !human) return;
    setHint(null);
    setDragOverSuit(null);
    setDragOverWork(null);

    if (source === "nerts" && !human.nertsPile.length) return;
    if (source === "waste" && !human.waste.length) return;
    if (source === "work") {
      const pile = human.work[workIndex];
      if (!pile.length) return;
      const topIndex = pile.length - 1;
      const safeStackStart = Number.isInteger(stackStart) ? Math.max(0, Math.min(stackStart, topIndex)) : topIndex;
      if (selected && selected.source === source && selected.workIndex === workIndex && selected.stackStart === safeStackStart) {
        setSelected(null);
        selectedRef.current = null;
        return;
      }
      const nextSelection = { source, workIndex, stackStart: safeStackStart };
      setSelected(nextSelection);
      selectedRef.current = nextSelection;
      return;
    }

    if (selected && selected.source === source) {
      setSelected(null);
      selectedRef.current = null;
      return;
    }

    const nextSelection = { source, workIndex, stackStart: null };
    setSelected(nextSelection);
    selectedRef.current = nextSelection;
  };

  const moveSelectedToFoundation = (clickedSuit, selectionOverride = null) => {
    const activeSelection = selectionOverride || selectedRef.current;
    if (screen !== "playing" || isPausedRef.current || !activeSelection || !board) return;

    const nextPlayers = clonePlayers(board.players);
    const nextFoundations = cloneFoundations(board.foundations);
    const me = nextPlayers[0];
    const card = getHumanSelectedCard(me, activeSelection);

    if (!card) return;
    if (activeSelection.source === "work") {
      const pile = me.work[activeSelection.workIndex];
      const topIndex = pile.length - 1;
      if (activeSelection.stackStart !== topIndex) {
        playSfx("error");
        pushMessage("Only top work card goes to foundation");
        return;
      }
    }
    if (clickedSuit && clickedSuit !== card.suit) {
      playSfx("error");
      pushMessage("Wrong suit");
      return;
    }

    const target = findFoundationTarget(card, nextFoundations);
    if (!target) {
      playSfx("error");
      pushMessage("No spot there");
      return;
    }

    setUndoSnapshot({
      board: {
        players: clonePlayers(board.players),
        foundations: cloneFoundations(board.foundations),
      },
      selected: activeSelection ? { ...activeSelection } : null,
    });

    let moved = null;
    if (activeSelection.source === "nerts") moved = me.nertsPile.pop();
    if (activeSelection.source === "waste") moved = me.waste.pop();
    if (activeSelection.source === "work") moved = me.work[activeSelection.workIndex].pop();

    if (!moved) return;

    pushToFoundation(nextFoundations, moved, target);

    const nextBoard = { players: nextPlayers, foundations: nextFoundations };
    boardRef.current = nextBoard;
    setBoard(nextBoard);
    setSelected(null);
    selectedRef.current = null;
    setHint(null);
    setDragOverSuit(null);
    setDragOverWork(null);
    playSfx("place");

    if (!me.nertsPile.length) {
      endRound(0, nextBoard);
    }
  };

  const moveSelectedToWork = (targetWorkIndex, selectionOverride = null) => {
    const activeSelection = selectionOverride || selectedRef.current;
    if (screen !== "playing" || isPausedRef.current || !activeSelection || !board) return;

    const nextPlayers = clonePlayers(board.players);
    const me = nextPlayers[0];
    const targetPile = me.work[targetWorkIndex];

    if (activeSelection.source === "work" && activeSelection.workIndex === targetWorkIndex) {
      setSelected(null);
      selectedRef.current = null;
      return;
    }

    let movingCards = [];
    if (activeSelection.source === "nerts") {
      const card = me.nertsPile[me.nertsPile.length - 1];
      if (!card) return;
      movingCards = [card];
      if (!canPlayOnWork(card, targetPile)) {
        playSfx("error");
        pushMessage("Can't stack");
        return;
      }
      me.nertsPile.pop();
    } else if (activeSelection.source === "waste") {
      const card = me.waste[me.waste.length - 1];
      if (!card) return;
      movingCards = [card];
      if (!canPlayOnWork(card, targetPile)) {
        playSfx("error");
        pushMessage("Can't stack");
        return;
      }
      me.waste.pop();
    } else if (activeSelection.source === "work") {
      const sourcePile = me.work[activeSelection.workIndex];
      if (!sourcePile.length) return;
      const topIndex = sourcePile.length - 1;
      const stackStart = Number.isInteger(activeSelection.stackStart)
        ? Math.max(0, Math.min(activeSelection.stackStart, topIndex))
        : topIndex;
      movingCards = sourcePile.slice(stackStart);
      if (!movingCards.length) return;
      if (!isValidDescendingStack(movingCards)) {
        playSfx("error");
        pushMessage("Invalid stack");
        return;
      }
      if (!canPlayOnWork(movingCards[0], targetPile)) {
        playSfx("error");
        pushMessage("Can't stack");
        return;
      }
      me.work[activeSelection.workIndex] = sourcePile.slice(0, stackStart);
    }

    if (!movingCards.length) return;
    setUndoSnapshot({
      board: {
        players: clonePlayers(board.players),
        foundations: cloneFoundations(board.foundations),
      },
      selected: activeSelection ? { ...activeSelection } : null,
    });
    me.work[targetWorkIndex].push(...movingCards);

    const nextBoard = { players: nextPlayers, foundations: cloneFoundations(board.foundations) };
    boardRef.current = nextBoard;
    setBoard(nextBoard);
    setSelected(null);
    selectedRef.current = null;
    setHint(null);
    setDragOverSuit(null);
    setDragOverWork(null);
    playSfx("place");

    if (!me.nertsPile.length) {
      endRound(0, nextBoard);
    }
  };

  const drawFromStock = () => {
    if (screen !== "playing" || isPausedRef.current || !board) return;
    ensureAudioEngine();
    setUndoSnapshot({
      board: {
        players: clonePlayers(board.players),
        foundations: cloneFoundations(board.foundations),
      },
      selected: selectedRef.current ? { ...selectedRef.current } : null,
    });
    const nextPlayers = clonePlayers(board.players);
    drawForPlayer(nextPlayers[0]);
    const nextBoard = { players: nextPlayers, foundations: cloneFoundations(board.foundations) };
    boardRef.current = nextBoard;
    setBoard(nextBoard);
    setSelected(null);
    selectedRef.current = null;
    setHint(null);
    setDragOverSuit(null);
    setDragOverWork(null);
    playSfx("draw");
  };

  const startDragFrom = (source, workIndex = null, stackStart = null) => (event) => {
    if (isPausedRef.current) return;
    const payload = { source, workIndex, stackStart };
    setDragPayload(payload);
    setHint(null);
    setDragOverSuit(null);
    setDragOverWork(null);
    let nextSelection = { source, workIndex, stackStart: null };
    if (source === "work") {
      const pile = human?.work?.[workIndex] || [];
      const topIndex = Math.max(0, pile.length - 1);
      const safeStackStart = Number.isInteger(stackStart) ? Math.max(0, Math.min(stackStart, topIndex)) : topIndex;
      nextSelection = { source, workIndex, stackStart: safeStackStart };
    }
    setSelected(nextSelection);
    selectedRef.current = nextSelection;
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "nerts-move");
    }
  };

  const endDrag = () => {
    setDragPayload(null);
    setDragOverSuit(null);
    setDragOverWork(null);
  };

  const onFoundationDragOver = (event, suitKey) => {
    if (isPausedRef.current) return;
    if (!dragPayload && !selectedRef.current) return;
    event.preventDefault();
    setDragOverSuit(suitKey);
    setDragOverWork(null);
  };

  const onFoundationDrop = (suitKey) => {
    if (isPausedRef.current) return;
    const payload = dragPayload || selectedRef.current;
    if (!payload) return;
    moveSelectedToFoundation(suitKey, payload);
    endDrag();
  };

  const onWorkDragOver = (event, workIndex) => {
    if (isPausedRef.current) return;
    if (!dragPayload && !selectedRef.current) return;
    event.preventDefault();
    setDragOverWork(workIndex);
    setDragOverSuit(null);
  };

  const onWorkDrop = (workIndex) => {
    if (isPausedRef.current) return;
    const payload = dragPayload || selectedRef.current;
    if (!payload) return;
    moveSelectedToWork(workIndex, payload);
    endDrag();
  };

  const findHint = useCallback(() => {
    const current = boardRef.current;
    const me = current?.players?.[0];
    if (!current || !me) return null;

    const topNerts = me.nertsPile[me.nertsPile.length - 1] || null;
    const topWaste = me.waste[me.waste.length - 1] || null;
    const topWorks = me.work.map((pile) => pile[pile.length - 1] || null);

    const foundationCandidates = [
      topNerts ? { source: "nerts", card: topNerts } : null,
      topWaste ? { source: "waste", card: topWaste } : null,
      ...topWorks.map((card, workIndex) => (card ? { source: "work", workIndex, stackStart: me.work[workIndex].length - 1, card } : null)),
    ].filter(Boolean);

    for (const candidate of foundationCandidates) {
      const target = findFoundationTarget(candidate.card, current.foundations);
      if (target) {
        return {
          kind: "foundation",
          source: candidate.source,
          workIndex: candidate.workIndex ?? null,
          stackStart: candidate.stackStart ?? null,
          suit: candidate.card.suit,
        };
      }
    }

    const workCandidates = [
      topNerts ? { source: "nerts", card: topNerts } : null,
      topWaste ? { source: "waste", card: topWaste } : null,
      ...topWorks.map((card, workIndex) => (card ? { source: "work", workIndex, stackStart: me.work[workIndex].length - 1, card } : null)),
    ].filter(Boolean);

    for (const candidate of workCandidates) {
      for (let targetWorkIndex = 0; targetWorkIndex < WORK_PILES; targetWorkIndex += 1) {
        if (candidate.source === "work" && candidate.workIndex === targetWorkIndex) continue;
        if (!canPlayOnWork(candidate.card, me.work[targetWorkIndex])) continue;
        return {
          kind: "work",
          source: candidate.source,
          workIndex: candidate.workIndex ?? null,
          stackStart: candidate.stackStart ?? null,
          targetWorkIndex,
        };
      }
    }

    if (me.stock.length || me.waste.length) return { kind: "draw" };
    return null;
  }, []);

  const applyHint = () => {
    if (screen !== "playing" || isPausedRef.current) return;
    const suggested = findHint();
    if (!suggested) {
      setHint(null);
      setDragOverSuit(null);
      setDragOverWork(null);
      playSfx("error");
      pushMessage("No useful move");
      return;
    }
    setHint(suggested);
    if (suggested.kind === "draw") {
      setSelected(null);
      selectedRef.current = null;
      setDragOverSuit(null);
      setDragOverWork(null);
      playSfx("hint");
      pushMessage("Hint: draw from stock");
      return;
    }

    const selection = {
      source: suggested.source,
      workIndex: suggested.workIndex ?? null,
      stackStart: suggested.stackStart ?? null,
    };
    setSelected(selection);
    selectedRef.current = selection;
    if (suggested.kind === "foundation") {
      setDragOverSuit(suggested.suit);
      setDragOverWork(null);
      playSfx("hint");
      pushMessage("Hint: send to foundation");
      return;
    }
    setDragOverWork(suggested.targetWorkIndex);
    setDragOverSuit(null);
    playSfx("hint");
    pushMessage("Hint: move to work pile");
  };

  const autoPlayFoundations = () => {
    if (screen !== "playing" || isPausedRef.current || !board) return;
    const nextPlayers = clonePlayers(board.players);
    const nextFoundations = cloneFoundations(board.foundations);
    const me = nextPlayers[0];

    let movedAny = false;
    let foundMove = true;
    while (foundMove) {
      foundMove = false;
      const candidates = [
        { source: "nerts" },
        { source: "waste" },
        ...Array.from({ length: WORK_PILES }, (_, workIndex) => ({ source: "work", workIndex })),
      ];
      for (const candidate of candidates) {
        let card = null;
        if (candidate.source === "nerts") card = me.nertsPile[me.nertsPile.length - 1] || null;
        if (candidate.source === "waste") card = me.waste[me.waste.length - 1] || null;
        if (candidate.source === "work") card = me.work[candidate.workIndex][me.work[candidate.workIndex].length - 1] || null;
        if (!card) continue;
        const target = findFoundationTarget(card, nextFoundations);
        if (!target) continue;
        let moved = null;
        if (candidate.source === "nerts") moved = me.nertsPile.pop();
        if (candidate.source === "waste") moved = me.waste.pop();
        if (candidate.source === "work") moved = me.work[candidate.workIndex].pop();
        if (!moved) continue;
        pushToFoundation(nextFoundations, moved, target);
        movedAny = true;
        foundMove = true;
        break;
      }
    }

    if (!movedAny) {
      playSfx("error");
      pushMessage("No auto moves");
      return;
    }

    setUndoSnapshot({
      board: {
        players: clonePlayers(board.players),
        foundations: cloneFoundations(board.foundations),
      },
      selected: selectedRef.current ? { ...selectedRef.current } : null,
    });
    const nextBoard = { players: nextPlayers, foundations: nextFoundations };
    boardRef.current = nextBoard;
    setBoard(nextBoard);
    setHint(null);
    setSelected(null);
    selectedRef.current = null;
    setDragOverSuit(null);
    setDragOverWork(null);
    playSfx("auto");
    pushMessage("Auto-play complete");

    if (!me.nertsPile.length) {
      endRound(0, nextBoard);
    }
  };

  const undoLastMove = () => {
    if (screen !== "playing" || isPausedRef.current || !undoSnapshot) return;
    const restored = {
      players: clonePlayers(undoSnapshot.board.players),
      foundations: cloneFoundations(undoSnapshot.board.foundations),
    };
    boardRef.current = restored;
    setBoard(restored);
    setSelected(undoSnapshot.selected ? { ...undoSnapshot.selected } : null);
    selectedRef.current = undoSnapshot.selected ? { ...undoSnapshot.selected } : null;
    setUndoSnapshot(null);
    setHint(null);
    setDragPayload(null);
    setTouchDrag(null);
    setDragOverSuit(null);
    setDragOverWork(null);
    playSfx("undo");
    pushMessage("Undid last move");
  };

  const detectDropTargetAtPoint = (x, y) => {
    if (typeof document === "undefined") return null;
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const foundationEl = el.closest("[data-drop-type='foundation']");
    if (foundationEl) {
      const suit = foundationEl.getAttribute("data-drop-suit");
      if (suit) return { type: "foundation", suit };
    }
    const workEl = el.closest("[data-drop-type='work']");
    if (workEl) {
      const raw = workEl.getAttribute("data-work-index");
      const workIndex = Number(raw);
      if (Number.isInteger(workIndex)) return { type: "work", workIndex };
    }
    return null;
  };

  const startTouchDragFrom = (source, workIndex = null, stackStart = null) => (event) => {
    if (screen !== "playing" || isPausedRef.current) return;
    if (event.pointerType === "mouse") return;
    if (source === "nerts" && !human?.nertsPile?.length) return;
    if (source === "waste" && !human?.waste?.length) return;
    if (source === "work" && !human?.work?.[workIndex]?.length) return;
    event.preventDefault();

    let nextSelection = { source, workIndex, stackStart: null };
    if (source === "work") {
      const pile = human?.work?.[workIndex] || [];
      const topIndex = Math.max(0, pile.length - 1);
      const safeStackStart = Number.isInteger(stackStart) ? Math.max(0, Math.min(stackStart, topIndex)) : topIndex;
      nextSelection = { source, workIndex, stackStart: safeStackStart };
    }
    setSelected(nextSelection);
    selectedRef.current = nextSelection;
    setDragPayload(nextSelection);
    setHint(null);
    setTouchDrag({
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      payload: nextSelection,
    });
    setDragOverSuit(null);
    setDragOverWork(null);
  };

  useEffect(() => {
    if (!touchDrag) return;

    const onPointerMove = (event) => {
      if (event.pointerId !== touchDragRef.current?.pointerId) return;
      event.preventDefault();
      setTouchDrag((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
      const target = detectDropTargetAtPoint(event.clientX, event.clientY);
      if (target?.type === "foundation") {
        setDragOverSuit(target.suit);
        setDragOverWork(null);
      } else if (target?.type === "work") {
        setDragOverWork(target.workIndex);
        setDragOverSuit(null);
      } else {
        setDragOverSuit(null);
        setDragOverWork(null);
      }
    };

    const finishTouchDrag = (event, cancelled = false) => {
      if (event.pointerId !== touchDragRef.current?.pointerId) return;
      event.preventDefault();
      if (!cancelled) {
        const target = detectDropTargetAtPoint(event.clientX, event.clientY);
        const payload = touchDragRef.current?.payload || selectedRef.current;
        if (target?.type === "foundation" && payload) {
          moveSelectedToFoundation(target.suit, payload);
        } else if (target?.type === "work" && payload) {
          moveSelectedToWork(target.workIndex, payload);
        }
      }
      setTouchDrag(null);
      setDragPayload(null);
      setDragOverSuit(null);
      setDragOverWork(null);
    };

    const onPointerCancel = (event) => finishTouchDrag(event, true);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", finishTouchDrag, { passive: false });
    window.addEventListener("pointercancel", onPointerCancel, { passive: false });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishTouchDrag);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [touchDrag?.pointerId]);

  const startNextRound = () => {
    ensureAudioEngine();
    playSfx("start");
    const champion = roundResult?.totals?.some((n) => n >= WIN_SCORE);
    const matchWinnerId =
      champion && roundResult?.totals?.length
        ? roundResult.totals.indexOf(Math.max(...roundResult.totals))
        : null;
    if (champion) {
      setStats((prev) => ({
        ...prev,
        matchesPlayed: prev.matchesPlayed + 1,
        matchesWon: prev.matchesWon + (matchWinnerId === 0 ? 1 : 0),
      }));
      setScreen("menu");
      setRoundResult(null);
      setSelected(null);
      selectedRef.current = null;
      setDragPayload(null);
      setDragOverSuit(null);
      setDragOverWork(null);
      setUndoSnapshot(null);
      setHint(null);
      setTouchDrag(null);
      roundStartMsRef.current = null;
      pauseStartedMsRef.current = null;
      pausedDurationMsRef.current = 0;
      isPausedRef.current = false;
      setIsPaused(false);
      clearSavedSession();
      return;
    }

    const next = initBoard(deckPreset);
    boardRef.current = next;
    setBoard(next);
    setRoundResult(null);
    setSelected(null);
    selectedRef.current = null;
    setDragPayload(null);
    setDragOverSuit(null);
    setDragOverWork(null);
    setUndoSnapshot(null);
    setHint(null);
    setTouchDrag(null);
    aiCursorRef.current = 1;
    roundStartMsRef.current = null;
    pauseStartedMsRef.current = null;
    pausedDurationMsRef.current = 0;
    isPausedRef.current = false;
    setIsPaused(false);
    setRoundNumber((r) => r + 1);
    setScreen("round");
  };

  const startPlayingRound = () => {
    ensureAudioEngine();
    playSfx("start");
    roundStartMsRef.current = Date.now();
    pauseStartedMsRef.current = null;
    pausedDurationMsRef.current = 0;
    isPausedRef.current = false;
    setIsPaused(false);
    setSelected(null);
    selectedRef.current = null;
    setHint(null);
    setDragPayload(null);
    setDragOverSuit(null);
    setDragOverWork(null);
    setTouchDrag(null);
    setScreen("playing");
  };

  const quitToMenu = () => {
    ensureAudioEngine();
    playSfx("tap");
    setScreen("menu");
    setSelected(null);
    selectedRef.current = null;
    setMessage("");
    setRoundResult(null);
    setDragPayload(null);
    setDragOverSuit(null);
    setDragOverWork(null);
    setUndoSnapshot(null);
    setHint(null);
    setTouchDrag(null);
    roundStartMsRef.current = null;
    pauseStartedMsRef.current = null;
    pausedDurationMsRef.current = 0;
    isPausedRef.current = false;
    setIsPaused(false);
  };

  const achievements = [
    { id: "first-round", title: "First Nertz", description: "Win your first round", unlocked: stats.roundWins >= 1 },
    { id: "five-rounds", title: "Table Runner", description: "Win 5 rounds", unlocked: stats.roundWins >= 5 },
    {
      id: "big-round",
      title: "Blitz Master",
      description: "Score +20 or more in one round",
      unlocked: stats.bestRoundPoints >= 20,
    },
    {
      id: "century-points",
      title: "Century Club",
      description: "Earn 100 total round points",
      unlocked: stats.totalRoundPoints >= 100,
    },
    { id: "first-match", title: "Match Winner", description: "Win your first match", unlocked: stats.matchesWon >= 1 },
    { id: "ten-rounds", title: "Unstoppable", description: "Win 10 rounds", unlocked: stats.roundWins >= 10 },
  ];
  const unlockedCount = achievements.filter((item) => item.unlocked).length;
  const roundWinRate = stats.roundsPlayed ? Math.round((stats.roundWins / stats.roundsPlayed) * 100) : 0;
  const matchWinRate = stats.matchesPlayed ? Math.round((stats.matchesWon / stats.matchesPlayed) * 100) : 0;
  const avgRoundPoints = stats.roundsPlayed ? (stats.totalRoundPoints / stats.roundsPlayed).toFixed(1) : "0.0";
  const avgRoundDurationMs = stats.roundsPlayed ? Math.round(stats.totalRoundDurationMs / stats.roundsPlayed) : 0;

  if (screen === "menu") {
    return (
      <div style={{ ...woodBackground, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ width: "min(420px, 94vw)", textAlign: "center" }}>
          <h1
            style={{
              margin: "0 0 20px",
              fontSize: "clamp(54px, 15vw, 96px)",
              letterSpacing: 2,
              lineHeight: 1,
              color: "#fff",
              textShadow: "4px 4px 0 rgba(0,0,0,0.45)",
            }}
          >
            NERTZ
          </h1>

          <div style={{ display: "grid", gap: 8 }}>
            {hasSavedSession && (
              <button
                type="button"
                onClick={() => {
                  ensureAudioEngine();
                  playSfx("tap");
                  resumeSavedSession();
                }}
                style={{
                  height: isPhone ? 48 : 52,
                  fontSize: isPhone ? 24 : 30,
                  lineHeight: 1,
                  color: "#ffffff",
                  background: "rgba(31,130,89,0.9)",
                  border: "none",
                  borderRadius: 0,
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                Resume Saved Match
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                ensureAudioEngine();
                playSfx("tap");
                setScreen("levels");
              }}
              style={{
                height: isPhone ? 52 : 58,
                fontSize: isPhone ? 34 : 42,
                lineHeight: 1,
                color: "#e9f1ff",
                background: "rgba(108,157,226,0.86)",
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              Play
            </button>
            <button
              type="button"
              onClick={() => {
                ensureAudioEngine();
                playSfx("tap");
                setShowRules(true);
              }}
              style={{
                height: isPhone ? 52 : 58,
                fontSize: isPhone ? 34 : 42,
                lineHeight: 1,
                color: "#ffffff",
                background: "rgba(55,24,7,0.7)",
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              How To Play
            </button>
            <button
              type="button"
              onClick={() => {
                ensureAudioEngine();
                playSfx("tap");
                setScreen("achievements");
              }}
              style={{
                height: isPhone ? 52 : 58,
                fontSize: isPhone ? 34 : 42,
                lineHeight: 1,
                color: "#ffffff",
                background: "rgba(55,24,7,0.7)",
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
                touchAction: "manipulation",
              }}
              >
                Achievements
              </button>
            </div>

          {hasSavedSession && (
            <button
              type="button"
              onClick={() => {
                ensureAudioEngine();
                playSfx("undo");
                clearSavedSession();
                pushMessage("Saved session cleared");
              }}
              style={{
                marginTop: 8,
                width: "100%",
                height: 32,
                fontSize: isPhone ? 12 : 13,
                color: "#fff",
                background: "rgba(0,0,0,0.24)",
                border: "1px solid rgba(255,255,255,0.3)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              Discard Saved Match
            </button>
          )}

          <div
            style={{
              marginTop: 10,
              padding: isPhone ? 8 : 10,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6,
              display: "grid",
              gap: 6,
            }}
          >
            <div style={{ fontSize: isPhone ? 14 : 16, opacity: 0.96 }}>Audio</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={toggleSfx}
                style={{
                  flex: 1,
                  height: 36,
                  fontSize: isPhone ? 13 : 14,
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.35)",
                  background: audioSettings.sfxEnabled ? "rgba(108,157,226,0.9)" : "rgba(55,24,7,0.72)",
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                SFX {audioSettings.sfxEnabled ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                onClick={toggleMusic}
                style={{
                  flex: 1,
                  height: 36,
                  fontSize: isPhone ? 13 : 14,
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.35)",
                  background: audioSettings.musicEnabled ? "rgba(108,157,226,0.9)" : "rgba(55,24,7,0.72)",
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                Music {audioSettings.musicEnabled ? "ON" : "OFF"}
              </button>
            </div>
            <button
              type="button"
              onClick={toggleHaptics}
              style={{
                height: 34,
                fontSize: isPhone ? 13 : 14,
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.35)",
                background: audioSettings.hapticsEnabled ? "rgba(108,157,226,0.9)" : "rgba(55,24,7,0.72)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              Haptics {audioSettings.hapticsEnabled ? "ON" : "OFF"}
            </button>
            <label style={{ fontSize: isPhone ? 11 : 12, opacity: 0.9, display: "grid", gap: 4 }}>
              <span>SFX Volume: {Math.round(clamp01(audioSettings.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume) * 100)}%</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(clamp01(audioSettings.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume) * 100)}
                onChange={updateSfxVolume}
                style={{ width: "100%", accentColor: "#6c9de2" }}
              />
            </label>
            <label style={{ fontSize: isPhone ? 11 : 12, opacity: 0.9, display: "grid", gap: 4 }}>
              <span>Music Volume: {Math.round(clamp01(audioSettings.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume) * 100)}%</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(clamp01(audioSettings.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume) * 100)}
                onChange={updateMusicVolume}
                style={{ width: "100%", accentColor: "#6c9de2" }}
              />
            </label>
            <div style={{ fontSize: isPhone ? 11 : 12, opacity: 0.86 }}>8-bit SFX + A Real Hero (synth fallback)</div>
          </div>

          <div style={{ marginTop: 14, fontSize: 16, minHeight: 22 }}>{message}</div>
        </div>

        {showRules && (
          <div
            onClick={() => setShowRules(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              display: "grid",
              placeItems: "center",
              padding: 14,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(560px, 92vw)",
                background: "rgba(34,14,4,0.9)",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 8,
                padding: isPhone ? 14 : 18,
                fontSize: isPhone ? 16 : 18,
                lineHeight: 1.35,
              }}
            >
              <div style={{ fontSize: isPhone ? 24 : 28, marginBottom: 10 }}>How to play</div>
              <div>1. Empty your 13-card NERTS pile before anyone else.</div>
              <div>2. Build center foundations by suit from low to high rank.</div>
              <div>3. Build your work piles down in alternating colors.</div>
              <div>4. Draw from stock when you run out of moves.</div>
              <button
                type="button"
                onClick={() => {
                  ensureAudioEngine();
                  playSfx("tap");
                  setShowRules(false);
                }}
                style={{
                  marginTop: 14,
                  height: 42,
                  width: "100%",
                  background: "rgba(108,157,226,0.9)",
                  color: "#fff",
                  border: "none",
                  fontSize: isPhone ? 20 : 22,
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (screen === "achievements") {
    return (
      <div style={{ ...woodBackground, padding: isPhone ? "10px 10px" : "10px 14px" }}>
        <button
          type="button"
          onClick={() => {
            ensureAudioEngine();
            playSfx("tap");
            setScreen("menu");
          }}
          style={{
            width: 42,
            height: 42,
            borderRadius: 22,
            border: "2px solid rgba(255,255,255,0.7)",
            background: "rgba(0,0,0,0.25)",
            color: "#fff",
            fontSize: 24,
            cursor: "pointer",
            touchAction: "manipulation",
          }}
        >
          ←
        </button>
        <h2 style={{ margin: "-36px 0 14px", textAlign: "center", fontSize: isPhone ? 38 : 48, fontWeight: 400 }}>Achievements</h2>

        <div
          style={{
            width: "min(680px, 96vw)",
            margin: "0 auto 14px",
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 6,
            padding: 10,
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(${isPhone ? 140 : 170}px, 1fr))`,
            gap: 8,
            fontSize: isPhone ? 14 : 16,
          }}
        >
          <div>Rounds: {stats.roundsPlayed}</div>
          <div>Round Wins: {stats.roundWins} ({roundWinRate}%)</div>
          <div>Matches: {stats.matchesPlayed}</div>
          <div>Match Wins: {stats.matchesWon} ({matchWinRate}%)</div>
          <div>Best Round: {stats.bestRoundPoints >= 0 ? `+${stats.bestRoundPoints}` : stats.bestRoundPoints}</div>
          <div>Avg Round Pts: {avgRoundPoints}</div>
          <div>Total Round Pts: {stats.totalRoundPoints}</div>
          <div>Best Margin: {stats.biggestWinMargin}</div>
          <div>Current Streak: {stats.currentWinStreak}</div>
          <div>Longest Streak: {stats.longestWinStreak}</div>
          <div>Avg Round Time: {formatDuration(avgRoundDurationMs)}</div>
          <div>Fastest Round: {formatDuration(stats.fastestRoundMs)}</div>
          <div>Slowest Round: {formatDuration(stats.slowestRoundMs)}</div>
          <div>Games Started: {stats.gamesStarted}</div>
        </div>

        <div style={{ width: "min(680px, 96vw)", margin: "0 auto", display: "grid", gap: 8 }}>
          {achievements.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                background: item.unlocked ? "rgba(108,157,226,0.5)" : "rgba(55,24,7,0.62)",
                border: item.unlocked ? "1px solid rgba(165, 206, 255, 0.85)" : "1px solid rgba(255,255,255,0.18)",
                borderRadius: 4,
              }}
            >
              <div>
                <div style={{ fontSize: isPhone ? 18 : 22, fontWeight: 600 }}>{item.title}</div>
                <div style={{ fontSize: isPhone ? 13 : 15, opacity: 0.92 }}>{item.description}</div>
              </div>
              <div style={{ fontSize: isPhone ? 24 : 28, minWidth: 30, textAlign: "center" }}>{item.unlocked ? "✓" : "○"}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 10, fontSize: 16 }}>
          {unlockedCount}/{achievements.length} unlocked
        </div>
      </div>
    );
  }

  if (screen === "levels") {
    return (
      <div style={{ ...woodBackground, padding: isPhone ? "10px 10px" : "10px 14px" }}>
        <button
          type="button"
          onClick={() => {
            ensureAudioEngine();
            playSfx("tap");
            setScreen("menu");
          }}
          style={{
            width: 42,
            height: 42,
            borderRadius: 22,
            border: "2px solid rgba(255,255,255,0.7)",
            background: "rgba(0,0,0,0.25)",
            color: "#fff",
            fontSize: 24,
            cursor: "pointer",
            touchAction: "manipulation",
          }}
        >
          ←
        </button>
        <h2 style={{ margin: "-36px 0 18px", textAlign: "center", fontSize: isPhone ? 40 : 54, fontWeight: 400 }}>Levels</h2>

        <div
          style={{
            width: "min(460px, 96vw)",
            margin: "0 auto 10px",
            padding: "10px",
            background: "rgba(255,255,255,0.16)",
            border: "1px solid rgba(255,255,255,0.24)",
            borderRadius: 6,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 17, opacity: 0.95 }}>Deck Style</div>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.values(DECK_PRESETS).map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  ensureAudioEngine();
                  playSfx("tap");
                  setDeckType(preset.key);
                }}
                style={{
                  flex: 1,
                  height: 42,
                  fontSize: isPhone ? 16 : 18,
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.4)",
                  background: deckType === preset.key ? "rgba(108,157,226,0.9)" : "rgba(55,24,7,0.72)",
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, opacity: 0.86 }}>{deckPreset.subtitle}</div>
        </div>

        <div style={{ width: "min(460px, 96vw)", margin: "0 auto", display: "grid", gap: 6 }}>
          {LEVELS.map((level, idx) => (
            <button
              key={level.key}
              type="button"
              onClick={() => prepareRound(level.key, true)}
              style={{
                height: isPhone ? 56 : 64,
                textAlign: "left",
                padding: "0 16px",
                fontSize: isPhone ? 32 : 44,
                color: "#fff",
                background: idx === 0 ? "rgba(108,157,226,0.86)" : "rgba(55,24,7,0.72)",
                border: "none",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (screen === "round") {
    return (
      <div style={{ ...woodBackground, padding: isPhone ? "10px 10px" : "10px 14px" }}>
        <button
          type="button"
          onClick={quitToMenu}
          style={{
            width: 42,
            height: 42,
            borderRadius: 22,
            border: "2px solid rgba(255,255,255,0.7)",
            background: "rgba(0,0,0,0.25)",
            color: "#fff",
            fontSize: 24,
            cursor: "pointer",
            touchAction: "manipulation",
          }}
        >
          ←
        </button>
        <h2 style={{ margin: "-36px 0 20px", textAlign: "center", fontSize: isPhone ? 40 : 54, fontWeight: 400 }}>Round {roundNumber}</h2>
        <div style={{ textAlign: "center", opacity: 0.92, marginBottom: 8, marginTop: -8, fontSize: isPhone ? 14 : 16 }}>
          Deck: {deckPreset.label}
        </div>

        <div style={{ width: "min(470px, 96vw)", margin: "0 auto 24px", background: "rgba(255,255,255,0.2)", borderRadius: 4, padding: isPhone ? 6 : 8 }}>
          {PLAYERS.map((player, idx) => (
            <div
              key={player.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                height: isPhone ? 36 : 42,
                padding: "0 10px",
                background: idx % 2 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.15)",
                fontSize: isPhone ? 24 : 34,
              }}
            >
              <span>{idx === 0 ? `★ ${player.name}` : player.name}</span>
              <span>{scores[idx]}</span>
            </div>
          ))}
        </div>

        <div style={{ width: "min(260px, 80vw)", margin: "0 auto" }}>
          <button
            type="button"
            onClick={startPlayingRound}
            style={{
              width: "100%",
              height: isPhone ? 58 : 66,
              fontSize: isPhone ? 32 : 44,
              color: "#fff",
              background: "rgba(55,24,7,0.72)",
              border: "none",
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            Play
          </button>
        </div>
      </div>
    );
  }

  if (screen === "roundOver" && roundResult) {
    const winnerName = PLAYERS[roundResult.winnerId]?.name || "Nobody";
    const champion = roundResult.totals.some((n) => n >= WIN_SCORE);
    const championName = champion ? PLAYERS[roundResult.totals.indexOf(Math.max(...roundResult.totals))].name : null;

    return (
      <div style={{ ...woodBackground, padding: isPhone ? "10px" : "14px" }}>
        <h2 style={{ textAlign: "center", fontSize: isPhone ? 34 : 52, margin: "10px 0 8px" }}>{winnerName} wins the round</h2>

        <div style={{ width: "min(520px, 96vw)", margin: "0 auto", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 6, overflow: "hidden" }}>
          {PLAYERS.map((player, idx) => (
            <div
              key={player.id}
              style={{
                display: "grid",
                gridTemplateColumns: isPhone ? "1.5fr 0.9fr 0.9fr 1fr" : "1.7fr 1fr 1fr 1fr",
                alignItems: "center",
                gap: isPhone ? 5 : 8,
                padding: isPhone ? "6px 8px" : "7px 10px",
                background: idx % 2 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.14)",
                fontSize: isPhone ? 15 : 20,
              }}
            >
              <strong>{player.name}</strong>
              <span>+{roundResult.foundationCounts[idx]}</span>
              <span>-{roundResult.nertsLeft[idx] * 2}</span>
              <span>
                {roundResult.roundPoints[idx] >= 0 ? "+" : ""}
                {roundResult.roundPoints[idx]} ({roundResult.totals[idx]})
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, textAlign: "center", minHeight: 26 }}>
          {champion ? `${championName} reached ${WIN_SCORE} points.` : `Target score: ${WIN_SCORE}`}
        </div>
        <div style={{ textAlign: "center", opacity: 0.9, marginTop: 4, marginBottom: 2 }}>
          Round Time: {formatDuration(roundResult.roundDurationMs)}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "center", flexWrap: isPhone ? "wrap" : "nowrap" }}>
          <button
            type="button"
            onClick={startNextRound}
            style={{
              minWidth: 180,
              height: 50,
              fontSize: isPhone ? 20 : 24,
              color: "#fff",
              background: "rgba(108,157,226,0.9)",
              border: "none",
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            {champion ? "New Match" : "Next Round"}
          </button>
          <button
            type="button"
            onClick={quitToMenu}
            style={{
              minWidth: 130,
              height: 50,
              fontSize: isPhone ? 20 : 24,
              color: "#fff",
              background: "rgba(55,24,7,0.72)",
              border: "none",
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            Menu
          </button>
        </div>
      </div>
    );
  }

  if (!human || screen !== "playing") return null;

  const aiPlayers = board.players.slice(1);
  const topOppCards = aiPlayers.map((ai) => ai.nertsPile[ai.nertsPile.length - 1] || null);
  const myNertsTop = human.nertsPile[human.nertsPile.length - 1] || null;
  const myWasteTop = human.waste[human.waste.length - 1] || null;
  const selectedStackCount =
    selected?.source === "work" && Number.isInteger(selected?.stackStart)
      ? Math.max(1, (human.work[selected.workIndex]?.length || 1) - selected.stackStart)
      : 1;
  const touchDragCard = touchDrag?.payload ? getHumanSelectedCard(human, touchDrag.payload) : null;

  return (
    <div style={{ ...woodBackground, overflow: "hidden", paddingBottom: 10 }}>
      <div style={{ display: "flex", alignItems: isCompact ? "flex-start" : "center", justifyContent: "space-between", flexWrap: isCompact ? "wrap" : "nowrap", rowGap: isCompact ? 6 : 0, padding: isCompact ? "8px 8px 6px" : "8px 10px", background: "rgba(0,0,0,0.22)", borderBottom: "1px solid rgba(255,255,255,0.22)" }}>
        <button
          type="button"
          onClick={quitToMenu}
          style={{
            width: isCompact ? 38 : 42,
            height: isCompact ? 38 : 42,
            borderRadius: isCompact ? 19 : 22,
            border: "2px solid rgba(255,255,255,0.7)",
            background: "rgba(0,0,0,0.25)",
            color: "#fff",
            fontSize: isCompact ? 20 : 24,
            cursor: "pointer",
            flexShrink: 0,
            touchAction: "manipulation",
          }}
        >
          ←
        </button>

        <div style={{ textAlign: "center", lineHeight: 1.1, flex: isCompact ? "1 1 auto" : "0 1 auto" }}>
          <div style={{ fontSize: isCompact ? 22 : 28, fontWeight: 500 }}>Round {roundNumber}</div>
          <div style={{ fontSize: isCompact ? 12 : 14, opacity: 0.9 }}>Level: {LEVELS.find((l) => l.key === difficulty)?.label || "Medium"}</div>
          <div style={{ fontSize: isCompact ? 11 : 12, opacity: 0.82 }}>Deck: {deckPreset.label}</div>
        </div>

        <div style={{ textAlign: isCompact ? "left" : "right", fontSize: isCompact ? 12 : 14, minWidth: isCompact ? "100%" : 120 }}>
          <div>You: {scores[0]}</div>
          <div style={{ opacity: 0.9 }}>Lead: {Math.max(...scores)}</div>
          <div style={{ display: "flex", justifyContent: isCompact ? "flex-start" : "flex-end", gap: 4, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => {
                if (isPaused) {
                  resumeRound();
                  return;
                }
                pauseRound("Paused");
              }}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                background: isPaused ? "rgba(31,130,89,0.9)" : "rgba(55,24,7,0.72)",
                color: "#fff",
                fontSize: isCompact ? 10 : 11,
                padding: isCompact ? "2px 5px" : "2px 6px",
                borderRadius: 4,
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={undoLastMove}
              disabled={!undoSnapshot || isPaused}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                background: undoSnapshot && !isPaused ? "rgba(55,24,7,0.72)" : "rgba(0,0,0,0.24)",
                color: "#fff",
                fontSize: isCompact ? 10 : 11,
                padding: isCompact ? "2px 5px" : "2px 6px",
                borderRadius: 4,
                cursor: undoSnapshot && !isPaused ? "pointer" : "default",
                touchAction: "manipulation",
              }}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={applyHint}
              disabled={isPaused}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                background: isPaused ? "rgba(0,0,0,0.24)" : "rgba(55,24,7,0.72)",
                color: "#fff",
                fontSize: isCompact ? 10 : 11,
                padding: isCompact ? "2px 5px" : "2px 6px",
                borderRadius: 4,
                cursor: isPaused ? "default" : "pointer",
                touchAction: "manipulation",
              }}
            >
              Hint
            </button>
            <button
              type="button"
              onClick={autoPlayFoundations}
              disabled={isPaused}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                background: isPaused ? "rgba(0,0,0,0.24)" : "rgba(108,157,226,0.85)",
                color: "#fff",
                fontSize: isCompact ? 10 : 11,
                padding: isCompact ? "2px 5px" : "2px 6px",
                borderRadius: 4,
                cursor: isPaused ? "default" : "pointer",
                touchAction: "manipulation",
              }}
            >
              Auto
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: isCompact ? "flex-start" : "flex-end", gap: 4, marginTop: 4 }}>
            <button
              type="button"
              onClick={toggleSfx}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                background: audioSettings.sfxEnabled ? "rgba(108,157,226,0.9)" : "rgba(0,0,0,0.24)",
                color: "#fff",
                fontSize: isCompact ? 10 : 11,
                padding: isCompact ? "2px 5px" : "2px 6px",
                borderRadius: 4,
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              SFX {audioSettings.sfxEnabled ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              onClick={toggleMusic}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                background: audioSettings.musicEnabled ? "rgba(108,157,226,0.9)" : "rgba(0,0,0,0.24)",
                color: "#fff",
                fontSize: isCompact ? 10 : 11,
                padding: isCompact ? "2px 5px" : "2px 6px",
                borderRadius: 4,
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              Music {audioSettings.musicEnabled ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              onClick={toggleHaptics}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                background: audioSettings.hapticsEnabled ? "rgba(108,157,226,0.9)" : "rgba(0,0,0,0.24)",
                color: "#fff",
                fontSize: isCompact ? 10 : 11,
                padding: isCompact ? "2px 5px" : "2px 6px",
                borderRadius: 4,
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              Haptic {audioSettings.hapticsEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: isCompact ? 5 : 8, padding: isCompact ? "6px 6px 0" : "8px 10px 0" }}>
        {aiPlayers.map((ai, idx) => {
          const rotate = idx === 0 ? -18 : idx === 1 ? 0 : 18;
          return (
            <div key={ai.id} style={{ textAlign: "center", width: "33%" }}>
              <div style={{ fontSize: isCompact ? 11 : 12, marginBottom: 4 }}>{PLAYERS[ai.id].name}</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <PlayingCard card={topOppCards[idx]} small compact={isCompact} rotate={rotate} />
              </div>
              <div style={{ fontSize: isCompact ? 11 : 12, marginTop: 2 }}>{ai.nertsPile.length}</div>
            </div>
          );
        })}
      </div>

      <FoundationGrid
        foundations={board.foundations}
        suits={deckPreset.suits}
        compact={isCompact}
        selectedCard={selectedCard}
        onCellClick={moveSelectedToFoundation}
        onCellDrop={onFoundationDrop}
        onCellDragOver={onFoundationDragOver}
        activeSuit={dragOverSuit}
      />

      <div style={{ width: "min(760px, 98vw)", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: isCompact ? 4 : 7, padding: "0 4px" }}>
        <div style={{ width: isCompact ? 34 : 46, textAlign: "center", fontSize: isCompact ? 24 : 32 }}>{human.nertsPile.length}</div>

        {human.work.map((pile, idx) => {
          const start = Math.max(0, pile.length - workVisibleCount);
          const visible = pile.slice(start);
          const stackHeight = mainCardHeight + Math.max(0, visible.length - 1) * workFanOffset;
          const selectedInPile = selected?.source === "work" && selected?.workIndex === idx;
          const selectedStart = selectedInPile && Number.isInteger(selected?.stackStart) ? selected.stackStart : -1;

          return (
            <div
              key={idx}
              data-drop-type="work"
              data-work-index={idx}
              onDragOver={(event) => onWorkDragOver(event, idx)}
              onDrop={(event) => {
                event.preventDefault();
                onWorkDrop(idx);
              }}
              style={{
                position: "relative",
                width: mainCardWidth,
                minHeight: mainCardHeight + 16,
                borderRadius: 6,
                boxShadow: dragOverWork === idx ? "0 0 0 2px rgba(125,186,255,0.8)" : "none",
                background: dragOverWork === idx ? "rgba(125,186,255,0.15)" : "transparent",
              }}
            >
              {pile.length ? (
                <div style={{ position: "relative", width: mainCardWidth, height: stackHeight }}>
                  {visible.map((card, vIdx) => {
                    const absoluteIndex = start + vIdx;
                    const isCardSelected = selectedInPile && absoluteIndex >= selectedStart;
                    return (
                      <div key={card.id} style={{ position: "absolute", left: 0, top: vIdx * workFanOffset, zIndex: vIdx + 1 }}>
                        <PlayingCard
                          card={card}
                          selected={isCardSelected}
                          compact={isCompact}
                          draggable
                          onDragStart={startDragFrom("work", idx, absoluteIndex)}
                          onDragEnd={endDrag}
                          onPointerDown={startTouchDragFrom("work", idx, absoluteIndex)}
                          onClick={() => {
                            if (selected && !(selected.source === "work" && selected.workIndex === idx)) {
                              moveSelectedToWork(idx);
                              return;
                            }
                            selectFromSource("work", idx, absoluteIndex);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <PlayingCard
                  card={null}
                  compact={isCompact}
                  onClick={() => {
                    if (selected) moveSelectedToWork(idx);
                  }}
                />
              )}
              {pile.length > 1 && (
                <div
                  style={{
                    position: "absolute",
                    top: -7,
                    right: -6,
                    minWidth: 18,
                    height: 18,
                    padding: "0 4px",
                    borderRadius: 9,
                    background: "rgba(0,0,0,0.6)",
                    fontSize: isCompact ? 11 : 12,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {pile.length}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ width: "min(700px, 96vw)", margin: "12px auto 0", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: isCompact ? 6 : 12 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: isCompact ? 6 : 8 }}>
          <div>
            <PlayingCard faceDown compact={isCompact} onClick={drawFromStock} />
            <div style={{ textAlign: "center", fontSize: isCompact ? 11 : 12, marginTop: 2 }}>{human.stock.length}</div>
          </div>
          <div>
            <PlayingCard
              card={myWasteTop}
              selected={selected?.source === "waste"}
              compact={isCompact}
              draggable={Boolean(myWasteTop)}
              onDragStart={startDragFrom("waste")}
              onDragEnd={endDrag}
              onPointerDown={startTouchDragFrom("waste")}
              onClick={() => {
                if (!myWasteTop) return;
                if (selected?.source === "waste") {
                  moveSelectedToFoundation(myWasteTop.suit);
                  return;
                }
                selectFromSource("waste");
              }}
            />
            <div style={{ textAlign: "center", fontSize: isCompact ? 11 : 12, marginTop: 2 }}>{human.waste.length}</div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <PlayingCard
            card={myNertsTop}
            selected={selected?.source === "nerts"}
            compact={isCompact}
            draggable={Boolean(myNertsTop)}
            onDragStart={startDragFrom("nerts")}
            onDragEnd={endDrag}
            onPointerDown={startTouchDragFrom("nerts")}
            onClick={() => {
              if (!myNertsTop) return;
              if (selected?.source === "nerts") {
                moveSelectedToFoundation(myNertsTop.suit);
                return;
              }
              selectFromSource("nerts");
            }}
          />
          <div style={{ fontSize: isCompact ? 12 : 13, marginTop: 3 }}>NERTS</div>
        </div>
      </div>

      <div style={{ marginTop: 10, minHeight: 24, textAlign: "center", fontSize: isCompact ? 14 : 16 }}>
        {selected
          ? `Selected: ${labelForSource(selected.source, selected.workIndex)}${selectedStackCount > 1 ? ` (${selectedStackCount} cards)` : ""}`
          : message || ""}
      </div>

      {isPaused && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.42)",
            display: "grid",
            placeItems: "center",
            zIndex: 180,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(320px, 90vw)",
              background: "rgba(34,14,4,0.92)",
              border: "1px solid rgba(255,255,255,0.26)",
              borderRadius: 8,
              padding: 14,
              textAlign: "center",
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: isPhone ? 26 : 30, lineHeight: 1 }}>Paused</div>
            <div style={{ fontSize: isPhone ? 13 : 14, opacity: 0.9 }}>Game state is saved locally.</div>
            <button
              type="button"
              onClick={resumeRound}
              style={{
                width: "100%",
                height: 44,
                fontSize: isPhone ? 22 : 24,
                color: "#fff",
                background: "rgba(31,130,89,0.9)",
                border: "none",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {touchDrag && (
        <div
          style={{
            position: "fixed",
            left: touchDrag.x + 10,
            top: touchDrag.y + 10,
            pointerEvents: "none",
            zIndex: 200,
            transform: "scale(1.05)",
            opacity: 0.92,
          }}
        >
          <PlayingCard
            card={touchDragCard}
            selected
            compact={isCompact}
          />
        </div>
      )}
    </div>
  );
}
