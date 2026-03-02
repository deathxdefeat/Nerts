"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SUITS = [
  { key: "clubs", symbol: "♣", color: "black" },
  { key: "hearts", symbol: "♥", color: "red" },
  { key: "spades", symbol: "♠", color: "black" },
  { key: "diamonds", symbol: "♦", color: "red" },
];

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

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

function createDeck(deckId) {
  const cards = [];
  for (const suit of SUITS) {
    for (let i = 0; i < RANKS.length; i += 1) {
      cards.push({
        id: `${deckId}-${suit.key}-${RANKS[i]}`,
        deckId,
        suit: suit.key,
        symbol: suit.symbol,
        color: suit.color,
        rank: RANKS[i],
        value: i + 1,
      });
    }
  }
  return cards;
}

function initPlayer(playerId) {
  const deck = shuffle(createDeck(playerId));
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

function initFoundations() {
  return {
    clubs: [],
    hearts: [],
    spades: [],
    diamonds: [],
  };
}

function initBoard() {
  return {
    players: PLAYERS.map((p) => initPlayer(p.id)),
    foundations: initFoundations(),
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
  return {
    clubs: foundations.clubs.map((pile) => [...pile]),
    hearts: foundations.hearts.map((pile) => [...pile]),
    spades: foundations.spades.map((pile) => [...pile]),
    diamonds: foundations.diamonds.map((pile) => [...pile]),
  };
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
  for (const suit of SUITS) {
    for (const pile of foundations[suit.key]) {
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
  rotate = 0,
  draggable = false,
  onDragStart,
  onDragEnd,
  onPointerDown,
}) {
  const width = small ? 54 : 74;
  const height = small ? 76 : 104;

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
          border: "none",
          borderRadius: 4,
          cursor: draggable ? "grab" : onClick ? "pointer" : "default",
          background:
            "linear-gradient(145deg, #7fa68f 0%, #5f816e 45%, #466d5a 100%), repeating-linear-gradient(45deg, rgba(255,255,255,0.22), rgba(255,255,255,0.22) 3px, rgba(0,0,0,0.05) 3px, rgba(0,0,0,0.05) 6px)",
          borderBottom: "3px solid rgba(0,0,0,0.2)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
          transform: `rotate(${rotate}deg)`,
          padding: 0,
          touchAction: draggable ? "none" : "auto",
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
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(255,255,255,0.08)",
          borderRadius: 4,
          cursor: draggable ? "grab" : onClick ? "pointer" : "default",
          color: "rgba(255,255,255,0.4)",
          fontSize: 24,
          touchAction: draggable ? "none" : "auto",
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
        border: selected ? "2px solid #7ab3ff" : "1px solid rgba(0,0,0,0.2)",
        borderRadius: 4,
        cursor: draggable ? "grab" : onClick ? "pointer" : "default",
        background: "#ffffff",
        color: card.color === "red" ? "#cc1e1e" : "#111111",
        boxShadow: selected ? "0 0 0 3px rgba(122,179,255,0.25)" : "0 1px 6px rgba(0,0,0,0.35)",
        transform: `rotate(${rotate}deg)`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "4px 5px",
        touchAction: draggable ? "none" : "auto",
      }}
    >
      <div style={{ textAlign: "left", lineHeight: 1 }}>
        <div style={{ fontSize: small ? 14 : 18, fontWeight: 700 }}>{card.rank}</div>
        <div style={{ fontSize: small ? 12 : 16, marginTop: -1 }}>{card.symbol}</div>
      </div>
      <div style={{ fontSize: small ? 18 : 28, opacity: 0.75 }}>{card.symbol}</div>
    </button>
  );
}

function FoundationGrid({ foundations, onCellClick, selectedCard, onCellDrop, onCellDragOver, activeSuit }) {
  return (
    <div
      style={{
        margin: "10px auto 14px",
        width: "min(560px, 94vw)",
        padding: "8px",
        background: "rgba(255,255,255,0.16)",
        borderRadius: 4,
        border: "1px solid rgba(255,255,255,0.2)",
      }}
    >
      {Array.from({ length: PLAYERS.length }).map((_, rowIdx) => (
        <div key={rowIdx} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: rowIdx === PLAYERS.length - 1 ? 0 : 4 }}>
          {SUITS.map((suit) => {
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
                  height: 52,
                  border:
                    activeSuit === suit.key
                      ? "2px solid rgba(125, 186, 255, 0.95)"
                      : selectedCard
                        ? "1px solid rgba(90, 146, 255, 0.6)"
                        : "1px solid rgba(255,255,255,0.2)",
                  background: activeSuit === suit.key ? "rgba(120, 183, 255, 0.22)" : "rgba(255,255,255,0.08)",
                  color: suit.color === "red" ? "#cf3030" : "#3a2010",
                  fontSize: 26,
                  borderRadius: 3,
                  cursor: selectedCard ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                {top ? (
                  <>
                    <span style={{ fontSize: 22, fontWeight: 700 }}>{top.rank}</span>
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
    "linear-gradient(rgba(35,14,3,0.18), rgba(35,14,3,0.18)), repeating-linear-gradient(90deg, #8c3f0d 0px, #9d4811 24px, #8b3e0d 48px)",
  backgroundColor: "#8d3f0f",
};

export default function NertsGame() {
  const [screen, setScreen] = useState("menu");
  const [difficulty, setDifficulty] = useState("medium");
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

  const boardRef = useRef(board);
  const scoresRef = useRef(scores);
  const screenRef = useRef(screen);
  const selectedRef = useRef(selected);
  const touchDragRef = useRef(touchDrag);
  const messageTimeoutRef = useRef(null);
  const aiCursorRef = useRef(1);
  const roundStartMsRef = useRef(null);

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

  const pushMessage = useCallback((text) => {
    clearTimeout(messageTimeoutRef.current);
    setMessage(text);
    messageTimeoutRef.current = setTimeout(() => setMessage(""), 1000);
  }, []);

  useEffect(() => {
    return () => clearTimeout(messageTimeoutRef.current);
  }, []);

  const prepareRound = useCallback((nextDifficulty, resetScores = false) => {
    const built = initBoard();
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

    if (resetScores) {
      scoresRef.current = [0, 0, 0, 0];
      setScores([0, 0, 0, 0]);
      setRoundNumber(1);
      setStats((prev) => ({ ...prev, gamesStarted: prev.gamesStarted + 1 }));
    }

    setScreen("round");
  }, []);

  const endRound = useCallback((winnerId, boardSnapshot) => {
    if (screenRef.current !== "playing") return;

    const foundationCounts = PLAYERS.map((p) => countFoundationCardsForDeck(boardSnapshot.foundations, p.id));
    const nertsLeft = boardSnapshot.players.map((p) => p.nertsPile.length);
    const roundPoints = foundationCounts.map((f, idx) => f - nertsLeft[idx] * 2);
    const totals = scoresRef.current.map((s, idx) => s + roundPoints[idx]);
    const roundDurationMs = roundStartMsRef.current ? Math.max(0, Date.now() - roundStartMsRef.current) : 0;
    roundStartMsRef.current = null;

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
  }, []);

  useEffect(() => {
    if (screen !== "playing") return;

    const timer = setInterval(() => {
      const current = boardRef.current;
      if (!current) return;
      if (touchDragRef.current) return;

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
  }, [difficulty, endRound, screen]);

  const human = board?.players?.[0] || null;
  const selectedCard = human && selected ? getHumanSelectedCard(human, selected) : null;

  const selectFromSource = (source, workIndex = null, stackStart = null) => {
    if (screen !== "playing" || !human) return;
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
    if (screen !== "playing" || !activeSelection || !board) return;

    const nextPlayers = clonePlayers(board.players);
    const nextFoundations = cloneFoundations(board.foundations);
    const me = nextPlayers[0];
    const card = getHumanSelectedCard(me, activeSelection);

    if (!card) return;
    if (activeSelection.source === "work") {
      const pile = me.work[activeSelection.workIndex];
      const topIndex = pile.length - 1;
      if (activeSelection.stackStart !== topIndex) {
        pushMessage("Only top work card goes to foundation");
        return;
      }
    }
    if (clickedSuit && clickedSuit !== card.suit) {
      pushMessage("Wrong suit");
      return;
    }

    const target = findFoundationTarget(card, nextFoundations);
    if (!target) {
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

    if (!me.nertsPile.length) {
      endRound(0, nextBoard);
    }
  };

  const moveSelectedToWork = (targetWorkIndex, selectionOverride = null) => {
    const activeSelection = selectionOverride || selectedRef.current;
    if (screen !== "playing" || !activeSelection || !board) return;

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
        pushMessage("Can't stack");
        return;
      }
      me.nertsPile.pop();
    } else if (activeSelection.source === "waste") {
      const card = me.waste[me.waste.length - 1];
      if (!card) return;
      movingCards = [card];
      if (!canPlayOnWork(card, targetPile)) {
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
        pushMessage("Invalid stack");
        return;
      }
      if (!canPlayOnWork(movingCards[0], targetPile)) {
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

    if (!me.nertsPile.length) {
      endRound(0, nextBoard);
    }
  };

  const drawFromStock = () => {
    if (screen !== "playing" || !board) return;
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
  };

  const startDragFrom = (source, workIndex = null, stackStart = null) => (event) => {
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
    if (!dragPayload && !selectedRef.current) return;
    event.preventDefault();
    setDragOverSuit(suitKey);
    setDragOverWork(null);
  };

  const onFoundationDrop = (suitKey) => {
    const payload = dragPayload || selectedRef.current;
    if (!payload) return;
    moveSelectedToFoundation(suitKey, payload);
    endDrag();
  };

  const onWorkDragOver = (event, workIndex) => {
    if (!dragPayload && !selectedRef.current) return;
    event.preventDefault();
    setDragOverWork(workIndex);
    setDragOverSuit(null);
  };

  const onWorkDrop = (workIndex) => {
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
    if (screen !== "playing") return;
    const suggested = findHint();
    if (!suggested) {
      setHint(null);
      setDragOverSuit(null);
      setDragOverWork(null);
      pushMessage("No useful move");
      return;
    }
    setHint(suggested);
    if (suggested.kind === "draw") {
      setSelected(null);
      selectedRef.current = null;
      setDragOverSuit(null);
      setDragOverWork(null);
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
      pushMessage("Hint: send to foundation");
      return;
    }
    setDragOverWork(suggested.targetWorkIndex);
    setDragOverSuit(null);
    pushMessage("Hint: move to work pile");
  };

  const autoPlayFoundations = () => {
    if (screen !== "playing" || !board) return;
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
    pushMessage("Auto-play complete");

    if (!me.nertsPile.length) {
      endRound(0, nextBoard);
    }
  };

  const undoLastMove = () => {
    if (screen !== "playing" || !undoSnapshot) return;
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
    if (screen !== "playing") return;
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
      return;
    }

    const next = initBoard();
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
    setRoundNumber((r) => r + 1);
    setScreen("round");
  };

  const startPlayingRound = () => {
    roundStartMsRef.current = Date.now();
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
            <button
              type="button"
              onClick={() => setScreen("levels")}
              style={{
                height: 58,
                fontSize: 42,
                lineHeight: 1,
                color: "#e9f1ff",
                background: "rgba(108,157,226,0.86)",
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
              }}
            >
              Play
            </button>
            <button
              type="button"
              onClick={() => setShowRules(true)}
              style={{
                height: 58,
                fontSize: 42,
                lineHeight: 1,
                color: "#ffffff",
                background: "rgba(55,24,7,0.7)",
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
              }}
            >
              How To Play
            </button>
            <button
              type="button"
              onClick={() => setScreen("achievements")}
              style={{
                height: 58,
                fontSize: 42,
                lineHeight: 1,
                color: "#ffffff",
                background: "rgba(55,24,7,0.7)",
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
              }}
            >
              Achievements
            </button>
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
                padding: 18,
                fontSize: 18,
                lineHeight: 1.35,
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 10 }}>How to play</div>
              <div>1. Empty your 13-card NERTS pile before anyone else.</div>
              <div>2. Build center foundations by suit from Ace to King.</div>
              <div>3. Build your work piles down in alternating colors.</div>
              <div>4. Draw from stock when you run out of moves.</div>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                style={{
                  marginTop: 14,
                  height: 42,
                  width: "100%",
                  background: "rgba(108,157,226,0.9)",
                  color: "#fff",
                  border: "none",
                  fontSize: 22,
                  cursor: "pointer",
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
      <div style={{ ...woodBackground, padding: "10px 14px" }}>
        <button
          type="button"
          onClick={() => setScreen("menu")}
          style={{
            width: 42,
            height: 42,
            borderRadius: 22,
            border: "2px solid rgba(255,255,255,0.7)",
            background: "rgba(0,0,0,0.25)",
            color: "#fff",
            fontSize: 24,
            cursor: "pointer",
          }}
        >
          ←
        </button>
        <h2 style={{ margin: "-36px 0 14px", textAlign: "center", fontSize: 48, fontWeight: 400 }}>Achievements</h2>

        <div
          style={{
            width: "min(680px, 96vw)",
            margin: "0 auto 14px",
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 6,
            padding: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 8,
            fontSize: 16,
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
                <div style={{ fontSize: 22, fontWeight: 600 }}>{item.title}</div>
                <div style={{ fontSize: 15, opacity: 0.92 }}>{item.description}</div>
              </div>
              <div style={{ fontSize: 28, minWidth: 30, textAlign: "center" }}>{item.unlocked ? "✓" : "○"}</div>
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
      <div style={{ ...woodBackground, padding: "10px 14px" }}>
        <button
          type="button"
          onClick={() => setScreen("menu")}
          style={{
            width: 42,
            height: 42,
            borderRadius: 22,
            border: "2px solid rgba(255,255,255,0.7)",
            background: "rgba(0,0,0,0.25)",
            color: "#fff",
            fontSize: 24,
            cursor: "pointer",
          }}
        >
          ←
        </button>
        <h2 style={{ margin: "-36px 0 18px", textAlign: "center", fontSize: 54, fontWeight: 400 }}>Levels</h2>

        <div style={{ width: "min(460px, 96vw)", margin: "0 auto", display: "grid", gap: 6 }}>
          {LEVELS.map((level, idx) => (
            <button
              key={level.key}
              type="button"
              onClick={() => prepareRound(level.key, true)}
              style={{
                height: 64,
                textAlign: "left",
                padding: "0 16px",
                fontSize: 44,
                color: "#fff",
                background: idx === 0 ? "rgba(108,157,226,0.86)" : "rgba(55,24,7,0.72)",
                border: "none",
                cursor: "pointer",
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
      <div style={{ ...woodBackground, padding: "10px 14px" }}>
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
          }}
        >
          ←
        </button>
        <h2 style={{ margin: "-36px 0 20px", textAlign: "center", fontSize: 54, fontWeight: 400 }}>Round {roundNumber}</h2>

        <div style={{ width: "min(470px, 96vw)", margin: "0 auto 24px", background: "rgba(255,255,255,0.2)", borderRadius: 4, padding: 8 }}>
          {PLAYERS.map((player, idx) => (
            <div
              key={player.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                height: 42,
                padding: "0 10px",
                background: idx % 2 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.15)",
                fontSize: 34,
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
              height: 66,
              fontSize: 44,
              color: "#fff",
              background: "rgba(55,24,7,0.72)",
              border: "none",
              cursor: "pointer",
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
      <div style={{ ...woodBackground, padding: "14px" }}>
        <h2 style={{ textAlign: "center", fontSize: 52, margin: "10px 0 8px" }}>{winnerName} wins the round</h2>

        <div style={{ width: "min(520px, 96vw)", margin: "0 auto", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 6, overflow: "hidden" }}>
          {PLAYERS.map((player, idx) => (
            <div
              key={player.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1.7fr 1fr 1fr 1fr",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                background: idx % 2 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.14)",
                fontSize: 20,
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

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            onClick={startNextRound}
            style={{
              minWidth: 180,
              height: 50,
              fontSize: 24,
              color: "#fff",
              background: "rgba(108,157,226,0.9)",
              border: "none",
              cursor: "pointer",
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
              fontSize: 24,
              color: "#fff",
              background: "rgba(55,24,7,0.72)",
              border: "none",
              cursor: "pointer",
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "rgba(0,0,0,0.22)", borderBottom: "1px solid rgba(255,255,255,0.22)" }}>
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
            flexShrink: 0,
          }}
        >
          ←
        </button>

        <div style={{ textAlign: "center", lineHeight: 1.1 }}>
          <div style={{ fontSize: 28, fontWeight: 500 }}>Round {roundNumber}</div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>Level: {LEVELS.find((l) => l.key === difficulty)?.label || "Medium"}</div>
        </div>

        <div style={{ textAlign: "right", fontSize: 14, minWidth: 120 }}>
          <div>You: {scores[0]}</div>
          <div style={{ opacity: 0.9 }}>Lead: {Math.max(...scores)}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 4 }}>
            <button
              type="button"
              onClick={undoLastMove}
              disabled={!undoSnapshot}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                background: undoSnapshot ? "rgba(55,24,7,0.72)" : "rgba(0,0,0,0.24)",
                color: "#fff",
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 4,
                cursor: undoSnapshot ? "pointer" : "default",
              }}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={applyHint}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                background: "rgba(55,24,7,0.72)",
                color: "#fff",
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Hint
            </button>
            <button
              type="button"
              onClick={autoPlayFoundations}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                background: "rgba(108,157,226,0.85)",
                color: "#fff",
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Auto
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "8px 10px 0" }}>
        {aiPlayers.map((ai, idx) => {
          const rotate = idx === 0 ? -18 : idx === 1 ? 0 : 18;
          return (
            <div key={ai.id} style={{ textAlign: "center", width: "33%" }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>{PLAYERS[ai.id].name}</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <PlayingCard card={topOppCards[idx]} small rotate={rotate} />
              </div>
              <div style={{ fontSize: 12, marginTop: 2 }}>{ai.nertsPile.length}</div>
            </div>
          );
        })}
      </div>

      <FoundationGrid
        foundations={board.foundations}
        selectedCard={selectedCard}
        onCellClick={moveSelectedToFoundation}
        onCellDrop={onFoundationDrop}
        onCellDragOver={onFoundationDragOver}
        activeSuit={dragOverSuit}
      />

      <div style={{ width: "min(760px, 98vw)", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 7, padding: "0 4px" }}>
        <div style={{ width: 46, textAlign: "center", fontSize: 32 }}>{human.nertsPile.length}</div>

        {human.work.map((pile, idx) => {
          const visibleCount = 7;
          const start = Math.max(0, pile.length - visibleCount);
          const visible = pile.slice(start);
          const stackHeight = 104 + Math.max(0, visible.length - 1) * 20;
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
                width: 74,
                minHeight: 120,
                borderRadius: 6,
                boxShadow: dragOverWork === idx ? "0 0 0 2px rgba(125,186,255,0.8)" : "none",
                background: dragOverWork === idx ? "rgba(125,186,255,0.15)" : "transparent",
              }}
            >
              {pile.length ? (
                <div style={{ position: "relative", width: 74, height: stackHeight }}>
                  {visible.map((card, vIdx) => {
                    const absoluteIndex = start + vIdx;
                    const isCardSelected = selectedInPile && absoluteIndex >= selectedStart;
                    return (
                      <div key={card.id} style={{ position: "absolute", left: 0, top: vIdx * 20, zIndex: vIdx + 1 }}>
                        <PlayingCard
                          card={card}
                          selected={isCardSelected}
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
                    fontSize: 12,
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

      <div style={{ width: "min(700px, 96vw)", margin: "12px auto 0", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <div>
            <PlayingCard faceDown onClick={drawFromStock} />
            <div style={{ textAlign: "center", fontSize: 12, marginTop: 2 }}>{human.stock.length}</div>
          </div>
          <div>
            <PlayingCard
              card={myWasteTop}
              selected={selected?.source === "waste"}
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
            <div style={{ textAlign: "center", fontSize: 12, marginTop: 2 }}>{human.waste.length}</div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <PlayingCard
            card={myNertsTop}
            selected={selected?.source === "nerts"}
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
          <div style={{ fontSize: 13, marginTop: 3 }}>NERTS</div>
        </div>
      </div>

      <div style={{ marginTop: 10, minHeight: 24, textAlign: "center", fontSize: 16 }}>
        {selected
          ? `Selected: ${labelForSource(selected.source, selected.workIndex)}${selectedStackCount > 1 ? ` (${selectedStackCount} cards)` : ""}`
          : message || ""}
      </div>

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
          />
        </div>
      )}
    </div>
  );
}
