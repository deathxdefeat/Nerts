"use client";
import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const SUITS = ["♠", "♥", "♦", "♣"];
const SUIT_COLORS = { "♠": "#1a1a2e", "♣": "#1a1a2e", "♥": "#d63031", "♦": "#d63031" };
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_VALUES = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 };

// ─── 8-BIT AUDIO ENGINE ─────────────────────────────────────────────────────
class ChiptuneAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;
  }
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.15;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  }
  _osc(type, freq, duration, startTime = 0, gainVal = 0.3) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + startTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + duration);
  }
  _noise(dur, start = 0, vol = 0.1) {
    if (!this.ctx || !this.enabled) return;
    const sz = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, sz, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 3000;
    src.buffer = buf;
    const t = this.ctx.currentTime + start;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.masterGain);
    src.start(t); src.stop(t + dur);
  }
  cardPlace() { this._osc("square", 880, 0.04, 0, 0.2); this._osc("square", 1320, 0.03, 0.02, 0.15); }
  cardFlip() { this._noise(0.05, 0, 0.08); this._osc("square", 440, 0.03, 0, 0.1); }
  cardError() { this._osc("square", 160, 0.1, 0, 0.2); this._osc("square", 120, 0.12, 0.08, 0.15); }
  draw() { this._noise(0.06, 0, 0.06); this._osc("triangle", 330, 0.05, 0, 0.15); }
  stockReset() {
    for (let i = 0; i < 4; i++) this._noise(0.03, i * 0.04, 0.05);
    this._osc("triangle", 220, 0.08, 0.12, 0.1);
  }
  select() { this._osc("square", 660, 0.03, 0, 0.12); }
  deselect() { this._osc("square", 440, 0.025, 0, 0.08); }
  nerts() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
      const t = [0, 0.08, 0.16, 0.24, 0.36, 0.44, 0.52][i];
      const d = [0.07, 0.07, 0.07, 0.1, 0.07, 0.07, 0.25][i];
      this._osc("square", f, d, t, 0.25);
      this._osc("triangle", f / 2, d + 0.02, t, 0.1);
    });
  }
  lose() { [440, 370, 311, 262, 220].forEach((f, i) => this._osc("square", f, 0.12, i * 0.1, 0.2)); }
  menuSelect() { this._osc("square", 440, 0.05, 0, 0.15); this._osc("square", 880, 0.08, 0.05, 0.2); }
  roundStart() {
    [262, 330, 392, 523].forEach((f, i) => {
      this._osc("square", f, 0.08, i * 0.07, 0.2);
      this._osc("triangle", f / 2, 0.1, i * 0.07, 0.08);
    });
  }
  stuck() { this._osc("triangle", 220, 0.15, 0, 0.15); this._osc("triangle", 185, 0.2, 0.12, 0.12); }
}
const audio = new ChiptuneAudio();

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function createDeck(deckId) {
  const cards = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      cards.push({ suit, rank, value: RANK_VALUES[rank], color: SUIT_COLORS[suit] === "#d63031" ? "red" : "black", deckId, id: `${rank}${suit}-${deckId}` });
  return cards;
}
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function canPlayOnFoundation(c, p) { if (!p.length) return c.value === 1; const t = p[p.length - 1]; return c.suit === t.suit && c.value === t.value + 1; }
function canPlayOnWork(c, p) { if (!p.length) return true; const t = p[p.length - 1]; return c.color !== t.color && c.value === t.value - 1; }
function initPlayer(id) {
  const d = shuffle(createDeck(id));
  return { nertsPile: d.slice(0, 13), work: [[d[13]], [d[14]], [d[15]], [d[16]]], stock: d.slice(17), waste: [], deckId: id };
}
function cloneP(p) { return { ...p, nertsPile: [...p.nertsPile], work: p.work.map(w => [...w]), stock: [...p.stock], waste: [...p.waste] }; }

// ─── STUCK DETECTION ─────────────────────────────────────────────────────────
function canMove(pl, fds) {
  const srcs = [];
  if (pl.nertsPile.length) srcs.push(pl.nertsPile[pl.nertsPile.length - 1]);
  if (pl.waste.length) srcs.push(pl.waste[pl.waste.length - 1]);
  pl.work.forEach(w => { if (w.length) srcs.push(w[w.length - 1]); });
  for (const c of srcs) { for (const f of fds) if (canPlayOnFoundation(c, f)) return true; }
  for (const c of srcs) { for (let i = 0; i < 4; i++) { const w = pl.work[i]; if (w.length && w[w.length - 1].id !== c.id && canPlayOnWork(c, w)) return true; } }
  if (pl.stock.length || pl.waste.length) return true;
  return false;
}

// ─── CARD COMPONENT ──────────────────────────────────────────────────────────
const CARD_W = 58, CARD_H = 82, STACK_OFF = 17;

function Card({ card, onClick, selected, small, faceDown, style }) {
  const w = small ? 44 : CARD_W, h = small ? 62 : CARD_H;
  const base = {
    width: w, height: h, borderRadius: 4, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: small ? "center" : "flex-start",
    cursor: onClick ? "pointer" : "default", userSelect: "none",
    fontFamily: "'Courier New', monospace", fontWeight: "bold",
    position: "relative", boxSizing: "border-box",
    transition: "transform 0.12s ease, box-shadow 0.12s ease",
    flexShrink: 0, ...style,
  };
  if (faceDown) return (
    <div onClick={onClick} style={{ ...base, background: "#0b2447", border: "2px solid #1a4a7a", boxShadow: "0 2px 6px rgba(0,0,0,0.4)", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 3, borderRadius: 2, background: "repeating-conic-gradient(#0b2447 0% 25%, #102e5a 0% 50%) 50%/6px 6px", opacity: 0.6 }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: small ? 12 : 16, color: "#1a4a7a", fontWeight: 900 }}>✦</div>
    </div>
  );
  if (!card) return null;
  const red = card.color === "red";
  return (
    <div onClick={onClick} style={{
      ...base,
      background: selected ? "linear-gradient(to bottom,#fffde7,#fff9c4)" : "linear-gradient(to bottom,#fff,#f0ece4)",
      border: selected ? "2px solid #ffd600" : "1.5px solid #c0b8a8",
      boxShadow: selected ? "0 0 10px rgba(255,214,0,0.5),0 4px 12px rgba(0,0,0,0.25)" : "0 1px 4px rgba(0,0,0,0.18)",
      color: red ? "#d63031" : "#1a1a2e",
      transform: selected ? "translateY(-2px) scale(1.03)" : "none",
      padding: small ? 1 : 3,
    }}>
      <div style={{ alignSelf: "flex-start", paddingLeft: small ? 2 : 4, paddingTop: small ? 1 : 2, lineHeight: 1 }}>
        <div style={{ fontSize: small ? 10 : 14, fontWeight: 900 }}>{card.rank}</div>
        <div style={{ fontSize: small ? 9 : 12, marginTop: -1 }}>{card.suit}</div>
      </div>
      {!small && <div style={{ fontSize: 22, marginTop: 0, opacity: 0.6 }}>{card.suit}</div>}
      {!small && <div style={{ position: "absolute", bottom: 2, right: 4, transform: "rotate(180deg)", lineHeight: 1, fontSize: 11, opacity: 0.5 }}><div>{card.rank}</div><div style={{ fontSize: 10, marginTop: -1 }}>{card.suit}</div></div>}
    </div>
  );
}

function EmptySlot({ label, onClick, small, style }) {
  return (
    <div onClick={onClick} style={{
      width: small ? 44 : CARD_W, height: small ? 62 : CARD_H, borderRadius: 4,
      border: "2px dashed rgba(255,255,255,0.12)", display: "flex", alignItems: "center",
      justifyContent: "center", color: "rgba(255,255,255,0.18)", fontSize: small ? 10 : 13,
      fontFamily: "'Courier New', monospace", fontWeight: 900,
      cursor: onClick ? "pointer" : "default", letterSpacing: 1, flexShrink: 0, ...style,
    }}>{label}</div>
  );
}

function WorkPile({ cards, onClickCard, onClickEmpty, selectedId, selectedStack }) {
  const maxShow = 8;
  const visible = cards.slice(-maxShow);
  const totalH = CARD_H + Math.max(0, visible.length - 1) * STACK_OFF;
  if (!cards.length) return <EmptySlot label="" onClick={onClickEmpty} />;
  return (
    <div style={{ position: "relative", width: CARD_W, height: totalH, flexShrink: 0 }}>
      {visible.map((card, vi) => {
        const ai = cards.length - visible.length + vi;
        const inStack = selectedStack?.some(c => c.id === card.id);
        return (
          <div key={card.id} style={{ position: "absolute", top: vi * STACK_OFF, left: 0, zIndex: vi + 1 }}>
            <Card card={card} selected={selectedId === card.id || inStack} onClick={() => onClickCard(card, ai)} />
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN GAME ───────────────────────────────────────────────────────────────
export default function NertsGame() {
  const [screen, setScreen] = useState("menu");
  const [foundations, setFoundations] = useState([]);
  const [player, setPlayer] = useState(null);
  const [ai, setAi] = useState(null);
  const [selected, setSelected] = useState(null);
  const [scores, setScores] = useState({ player: 0, ai: 0 });
  const [roundOver, setRoundOver] = useState(false);
  const [roundScores, setRoundScores] = useState(null);
  const [difficulty, setDifficulty] = useState("normal");
  const [soundOn, setSoundOn] = useState(true);
  const [message, setMessage] = useState("");
  const [stuckTicks, setStuckTicks] = useState(0);
  const [flashF, setFlashF] = useState(null);
  const [roundNum, setRoundNum] = useState(1);
  const aiRef = useRef(null);
  const msgT = useRef(null);

  const speeds = { easy: 2200, normal: 1400, hard: 700, expert: 400 };
  const showMsg = useCallback((m, d = 1200) => { setMessage(m); clearTimeout(msgT.current); msgT.current = setTimeout(() => setMessage(""), d); }, []);
  useEffect(() => { audio.enabled = soundOn; }, [soundOn]);

  const startRound = useCallback((diff) => {
    audio.init(); setDifficulty(diff);
    setPlayer(initPlayer(0)); setAi(initPlayer(1));
    setFoundations(Array(8).fill(null).map(() => []));
    setSelected(null); setRoundOver(false); setRoundScores(null);
    setStuckTicks(0); setMessage(""); setScreen("playing");
    setTimeout(() => audio.roundStart(), 200);
  }, []);

  const endRound = useCallback((winner, p, a, f) => {
    const pF = f.reduce((s, pile) => s + pile.filter(c => c.deckId === 0).length, 0);
    const aF = f.reduce((s, pile) => s + pile.filter(c => c.deckId === 1).length, 0);
    const pN = p.nertsPile.length, aN = a.nertsPile.length;
    const pS = pF - pN * 2, aS = aF - aN * 2;
    setRoundScores({ pF, aF, pN, aN, pS, aS, winner });
    setScores(prev => ({ player: prev.player + pS, ai: prev.ai + aS }));
    setRoundOver(true);
    winner === "player" ? audio.nerts() : winner === "ai" ? audio.lose() : audio.stuck();
  }, []);

  // ─── AI ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing" || roundOver) { clearInterval(aiRef.current); return; }
    const spd = speeds[difficulty] || 1400;
    aiRef.current = setInterval(() => {
      setAi(prevAi => {
        if (!prevAi || roundOver) return prevAi;
        setFoundations(prevF => {
          const na = cloneP(prevAi);
          const nf = prevF.map(p => [...p]);
          let moved = false;
          // Nerts → foundation
          if (!moved && na.nertsPile.length) {
            const c = na.nertsPile[na.nertsPile.length - 1];
            for (let i = 0; i < nf.length; i++) if (canPlayOnFoundation(c, nf[i])) {
              nf[i].push(na.nertsPile.pop()); moved = true;
              if (!na.nertsPile.length) setTimeout(() => setPlayer(p => { endRound("ai", p, na, nf); return p; }), 0);
              break;
            }
          }
          // Work → foundation
          if (!moved) for (let w = 0; w < 4; w++) { if (!na.work[w].length) continue; const c = na.work[w][na.work[w].length - 1]; for (let i = 0; i < nf.length; i++) if (canPlayOnFoundation(c, nf[i])) { nf[i].push(na.work[w].pop()); moved = true; break; } if (moved) break; }
          // Nerts → work
          if (!moved && na.nertsPile.length) {
            const c = na.nertsPile[na.nertsPile.length - 1];
            for (let w = 0; w < 4; w++) if (canPlayOnWork(c, na.work[w])) {
              na.work[w].push(na.nertsPile.pop()); moved = true;
              if (!na.nertsPile.length) setTimeout(() => setPlayer(p => { endRound("ai", p, na, nf); return p; }), 0);
              break;
            }
          }
          // Waste → foundation
          if (!moved && na.waste.length) { const c = na.waste[na.waste.length - 1]; for (let i = 0; i < nf.length; i++) if (canPlayOnFoundation(c, nf[i])) { nf[i].push(na.waste.pop()); moved = true; break; } }
          // Waste → work
          if (!moved && na.waste.length) { const c = na.waste[na.waste.length - 1]; for (let w = 0; w < 4; w++) if (na.work[w].length && canPlayOnWork(c, na.work[w])) { na.work[w].push(na.waste.pop()); moved = true; break; } }
          // Work → work (reorg)
          if (!moved && difficulty !== "easy") {
            for (let f = 0; f < 4; f++) { if (na.work[f].length <= 1) continue; for (let t = 0; t < 4; t++) { if (t === f) continue; if (!na.work[t].length && na.work[f].length > 1) { na.work[t] = na.work[f].splice(0); moved = true; break; } } if (moved) break; }
          }
          // Draw
          if (!moved) { if (na.stock.length) { na.waste.push(...na.stock.splice(0, Math.min(3, na.stock.length))); } else if (na.waste.length) { na.stock = [...na.waste].reverse(); na.waste = []; } }
          setAi(na);
          return nf;
        });
        return prevAi;
      });
    }, spd + Math.floor(Math.random() * spd * 0.3));
    return () => clearInterval(aiRef.current);
  }, [screen, roundOver, difficulty, endRound]);

  // ─── STUCK ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing" || roundOver || !player || !ai) return;
    const t = setInterval(() => {
      if (!canMove(player, foundations) && !canMove(ai, foundations)) {
        setStuckTicks(prev => {
          if (prev >= 3) { showMsg("Stalemate!", 2000); setTimeout(() => endRound("draw", player, ai, foundations), 1500); return 0; }
          showMsg(`Both stuck (${prev + 1}/3)`, 1500); audio.stuck(); return prev + 1;
        });
      } else setStuckTicks(0);
    }, 5000);
    return () => clearInterval(t);
  }, [screen, roundOver, player, ai, foundations, showMsg, endRound]);

  // ─── PLAYER ACTIONS ──────────────────────────────────────────────────────
  const clearSel = () => { if (selected) audio.deselect(); setSelected(null); };

  const autoPlayF = (sel) => {
    for (let i = 0; i < foundations.length; i++) if (canPlayOnFoundation(sel.card, foundations[i])) { playOnF(i, sel); return; }
    showMsg("No valid play"); audio.cardError(); setSelected(null);
  };

  const selCard = (source, card, workIndex, stackCards) => {
    if (roundOver) return;
    if (selected?.card.id === card.id) { autoPlayF(selected); return; }
    audio.select();
    setSelected({ source, card, workIndex, stackCards });
  };

  const playOnF = (fi, sel = selected) => {
    if (!sel || roundOver) return;
    if (!canPlayOnFoundation(sel.card, foundations[fi])) { showMsg("Can't go there"); audio.cardError(); return; }
    audio.cardPlace(); setFlashF(fi); setTimeout(() => setFlashF(null), 300);
    setFoundations(prev => { const nf = prev.map(p => [...p]); nf[fi] = [...nf[fi], sel.card]; return nf; });
    setPlayer(prev => {
      const np = cloneP(prev);
      if (sel.source === "nerts") { np.nertsPile.pop(); if (!np.nertsPile.length) setTimeout(() => endRound("player", np, ai, foundations), 200); }
      else if (sel.source === "waste") np.waste.pop();
      else if (sel.source === "work") np.work[sel.workIndex].pop();
      return np;
    });
    setSelected(null);
  };

  const playOnW = (wi) => {
    if (!selected || roundOver) return;
    if (selected.source === "work" && selected.workIndex === wi) { clearSel(); return; }
    // Stack move
    if (selected.source === "work" && selected.stackCards?.length) {
      const bot = selected.stackCards[0];
      if (!canPlayOnWork(bot, player.work[wi])) { showMsg("Can't stack"); audio.cardError(); return; }
      audio.cardPlace();
      setPlayer(prev => { const np = cloneP(prev); const idx = np.work[selected.workIndex].findIndex(c => c.id === bot.id); np.work[wi].push(...np.work[selected.workIndex].splice(idx)); return np; });
      setSelected(null); return;
    }
    if (!canPlayOnWork(selected.card, player.work[wi])) { showMsg("Can't stack"); audio.cardError(); return; }
    audio.cardPlace();
    setPlayer(prev => {
      const np = cloneP(prev);
      if (selected.source === "nerts") { np.nertsPile.pop(); if (!np.nertsPile.length) setTimeout(() => endRound("player", np, ai, foundations), 200); }
      else if (selected.source === "waste") np.waste.pop();
      else if (selected.source === "work") np.work[selected.workIndex].pop();
      np.work[wi].push(selected.card); return np;
    });
    setSelected(null);
  };

  const drawStock = () => {
    if (roundOver) return; clearSel();
    setPlayer(prev => {
      const np = cloneP(prev);
      if (np.stock.length) { audio.draw(); np.waste.push(...np.stock.splice(0, Math.min(3, np.stock.length))); }
      else if (np.waste.length) { audio.stockReset(); np.stock = [...np.waste].reverse(); np.waste = []; }
      return np;
    });
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────
  const PF = "'Courier New','Lucida Console',monospace";

  if (screen === "menu") {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#0a0a1a 0%,#0d2818 40%,#0a0a1a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: PF, color: "#c0d8b0" }}>
        <div style={{ textAlign: "center", padding: "32px 40px", background: "rgba(0,0,0,0.5)", border: "3px solid #2d5a1e", borderRadius: 2, boxShadow: "0 0 40px rgba(45,90,30,0.2),inset 0 0 60px rgba(0,0,0,0.3)" }}>
          <h1 style={{ fontSize: 56, margin: 0, letterSpacing: 12, color: "#4ade80", textShadow: "3px 3px 0 #166534,-1px -1px 0 #166534,0 0 20px rgba(74,222,128,0.3)", fontWeight: 900 }}>NERTS</h1>
          <div style={{ fontSize: 10, letterSpacing: 6, color: "#6ee7b7", marginTop: 4, opacity: 0.7 }}>★ CARD BATTLE ★</div>
          <div style={{ margin: "28px 0 8px", fontSize: 11, letterSpacing: 3, color: "#6ee7b7", opacity: 0.6, textTransform: "uppercase" }}>SELECT DIFFICULTY</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { l: "EASY", d: "easy", c: "#4ade80" },
              { l: "NORMAL", d: "normal", c: "#fbbf24" },
              { l: "HARD", d: "hard", c: "#f97316" },
              { l: "EXPERT", d: "expert", c: "#ef4444" },
            ].map(({ l, d, c }) => (
              <button key={d} onClick={() => { audio.init(); audio.menuSelect(); startRound(d); }}
                style={{ padding: "10px 40px", fontSize: 15, fontFamily: PF, background: "transparent", color: c, border: `2px solid ${c}44`, borderRadius: 2, cursor: "pointer", letterSpacing: 4, fontWeight: 900, transition: "all 0.1s" }}
                onMouseOver={e => { e.target.style.background = `${c}22`; e.target.style.borderColor = c; }}
                onMouseOut={e => { e.target.style.background = "transparent"; e.target.style.borderColor = `${c}44`; }}
              >{l}</button>
            ))}
          </div>
          <div style={{ marginTop: 24, fontSize: 9, color: "#4ade80", opacity: 0.4, lineHeight: 1.8, maxWidth: 280, letterSpacing: 1 }}>
            CLICK CARD → CLICK DESTINATION<br />DOUBLE-CLICK → AUTO-PLAY TO FOUNDATION<br />EMPTY YOUR NERTS PILE TO WIN
          </div>
          <button onClick={() => { audio.init(); setSoundOn(s => !s); }}
            style={{ marginTop: 16, padding: "4px 16px", fontSize: 10, fontFamily: PF, background: "transparent", color: soundOn ? "#4ade80" : "#666", border: `1px solid ${soundOn ? "#4ade8044" : "#333"}`, borderRadius: 2, cursor: "pointer", letterSpacing: 2 }}>
            SOUND: {soundOn ? "ON" : "OFF"}
          </button>
        </div>
      </div>
    );
  }

  if (!player || !ai) return null;
  const nertsTop = player.nertsPile.length ? player.nertsPile[player.nertsPile.length - 1] : null;
  const wasteTop = player.waste.length ? player.waste[player.waste.length - 1] : null;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#060612 0%,#0d2818 30%,#0a1a10 70%,#060612 100%)", fontFamily: PF, color: "#c0d8b0", display: "flex", flexDirection: "column", overflow: "hidden" }}
      onClick={e => { if (e.target === e.currentTarget) clearSel(); }}>

      {/* HUD */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "rgba(0,0,0,0.6)", borderBottom: "2px solid #1a3a1a", fontSize: 11, letterSpacing: 1, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span><span style={{ color: "#4ade80" }}>YOU</span> {scores.player}</span>
          <span style={{ color: "#333" }}>│</span>
          <span><span style={{ color: "#ef4444" }}>CPU</span> {scores.ai}</span>
          <span style={{ color: "#333" }}>│</span>
          <span style={{ color: "#666", fontSize: 9 }}>RD {roundNum}</span>
        </div>
        <div style={{ color: "#fbbf24", fontSize: 10, fontStyle: "italic", transition: "opacity 0.3s", opacity: message ? 1 : 0, minHeight: 14 }}>{message}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "#666" }}>CPU NERTS: {ai.nertsPile.length}</span>
          <button onClick={() => setSoundOn(s => !s)} style={{ background: "none", border: "1px solid #333", color: soundOn ? "#4ade80" : "#444", padding: "1px 6px", borderRadius: 2, cursor: "pointer", fontSize: 9, fontFamily: PF }}>{soundOn ? "♪" : "×"}</button>
          <button onClick={() => { setScreen("menu"); setScores({ player: 0, ai: 0 }); setRoundNum(1); }} style={{ background: "none", border: "1px solid #333", color: "#888", padding: "1px 8px", borderRadius: 2, cursor: "pointer", fontSize: 9, fontFamily: PF }}>QUIT</button>
        </div>
      </div>

      {/* ROUND OVER */}
      {roundOver && roundScores && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, fontFamily: PF }}>
          <div style={{ background: "#0a0a1a", border: `3px solid ${roundScores.winner === "player" ? "#4ade80" : roundScores.winner === "ai" ? "#ef4444" : "#fbbf24"}`, borderRadius: 2, padding: "28px 36px", textAlign: "center", minWidth: 300, boxShadow: `0 0 40px ${roundScores.winner === "player" ? "rgba(74,222,128,0.15)" : "rgba(239,68,68,0.15)"}` }}>
            <h2 style={{ color: roundScores.winner === "player" ? "#4ade80" : roundScores.winner === "ai" ? "#ef4444" : "#fbbf24", fontSize: 28, margin: 0, letterSpacing: 4, textShadow: `0 0 20px ${roundScores.winner === "player" ? "rgba(74,222,128,0.4)" : "rgba(239,68,68,0.4)"}` }}>
              {roundScores.winner === "player" ? "★ NERTS! ★" : roundScores.winner === "ai" ? "CPU WINS" : "STALEMATE"}
            </h2>
            <div style={{ margin: "20px 0", fontSize: 11, lineHeight: 2.2, display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0 20px", color: "#888" }}>
              <div style={{ textAlign: "right", color: "#4ade80" }}>YOU</div><div></div><div style={{ textAlign: "left", color: "#ef4444" }}>CPU</div>
              <div style={{ textAlign: "right" }}>+{roundScores.pF}</div><div style={{ color: "#555" }}>FOUND</div><div style={{ textAlign: "left" }}>+{roundScores.aF}</div>
              <div style={{ textAlign: "right" }}>-{roundScores.pN * 2}</div><div style={{ color: "#555" }}>NERTS</div><div style={{ textAlign: "left" }}>-{roundScores.aN * 2}</div>
              <div style={{ textAlign: "right", borderTop: "1px solid #333", paddingTop: 6, fontWeight: 900, color: roundScores.pS >= roundScores.aS ? "#4ade80" : "#ef4444" }}>{roundScores.pS >= 0 ? "+" : ""}{roundScores.pS}</div>
              <div style={{ borderTop: "1px solid #333", paddingTop: 6, color: "#555" }}>TOTAL</div>
              <div style={{ textAlign: "left", borderTop: "1px solid #333", paddingTop: 6, fontWeight: 900, color: roundScores.aS >= roundScores.pS ? "#4ade80" : "#ef4444" }}>{roundScores.aS >= 0 ? "+" : ""}{roundScores.aS}</div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
              <button onClick={() => { setRoundNum(r => r + 1); startRound(difficulty); audio.menuSelect(); }} style={{ padding: "8px 20px", fontSize: 13, fontFamily: PF, fontWeight: 900, background: "transparent", color: "#4ade80", border: "2px solid #4ade80", borderRadius: 2, cursor: "pointer", letterSpacing: 3 }}>NEXT</button>
              <button onClick={() => { setScores({ player: 0, ai: 0 }); setRoundNum(1); setScreen("menu"); }} style={{ padding: "8px 20px", fontSize: 13, fontFamily: PF, fontWeight: 900, background: "transparent", color: "#666", border: "2px solid #333", borderRadius: 2, cursor: "pointer", letterSpacing: 3 }}>MENU</button>
            </div>
          </div>
        </div>
      )}

      {/* FOUNDATIONS */}
      <div style={{ display: "flex", justifyContent: "center", gap: 5, padding: "8px 4px 6px", background: "rgba(0,0,0,0.25)", borderBottom: "1px solid rgba(45,90,30,0.2)", flexShrink: 0, flexWrap: "wrap" }}>
        <div style={{ width: "100%", textAlign: "center", fontSize: 9, letterSpacing: 3, color: "#2d5a1e", marginBottom: 2, textTransform: "uppercase" }}>FOUNDATIONS</div>
        {foundations.map((pile, fi) => (
          <div key={fi} onClick={() => selected && playOnF(fi)} style={{ cursor: selected ? "pointer" : "default", transition: "transform 0.15s", transform: flashF === fi ? "scale(1.08)" : "none" }}>
            {pile.length ? <Card card={pile[pile.length - 1]} small style={flashF === fi ? { boxShadow: "0 0 12px rgba(74,222,128,0.6)" } : {}} /> : <EmptySlot label="A" small onClick={() => selected && playOnF(fi)} style={selected ? { borderColor: "rgba(74,222,128,0.3)" } : {}} />}
          </div>
        ))}
      </div>

      {/* WORK PILES */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 8, padding: "10px 8px", alignItems: "flex-start", minHeight: 200, overflow: "auto" }}>
        {player.work.map((pile, wi) => (
          <div key={wi} onClick={e => { if (selected && !pile.length) { playOnW(wi); e.stopPropagation(); } }}>
            <WorkPile cards={pile} selectedId={selected?.card.id} selectedStack={selected?.stackCards}
              onClickEmpty={() => selected && playOnW(wi)}
              onClickCard={(card, actualIdx) => {
                if (selected) {
                  if (selected.source === "work" && selected.workIndex === wi) {
                    if (card.id === pile[pile.length - 1].id && selected.card.id === card.id) { autoPlayF(selected); return; }
                    selCard("work", card, wi, pile.slice(actualIdx)); return;
                  }
                  playOnW(wi);
                } else {
                  selCard("work", card, wi, pile.slice(actualIdx));
                }
              }} />
          </div>
        ))}
      </div>

      {/* NERTS / STOCK / WASTE */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 16, padding: "10px 8px 14px", background: "rgba(0,0,0,0.3)", borderTop: "2px solid #1a3a1a", flexShrink: 0 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#4ade80", marginBottom: 4, letterSpacing: 2, fontWeight: 900 }}>NERTS <span style={{ color: "#2d5a1e" }}>({player.nertsPile.length})</span></div>
          {nertsTop ? <Card card={nertsTop} onClick={() => selected?.source === "nerts" ? autoPlayF(selected) : selCard("nerts", nertsTop)} selected={selected?.source === "nerts"} /> : <EmptySlot label="✓" style={{ borderColor: "#4ade8044", color: "#4ade80" }} />}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#666", marginBottom: 4, letterSpacing: 2, fontWeight: 900 }}>STOCK <span style={{ color: "#444" }}>({player.stock.length})</span></div>
          {player.stock.length ? <Card faceDown onClick={drawStock} /> : <EmptySlot label="↻" onClick={drawStock} style={player.waste.length ? { borderColor: "#fbbf2444", color: "#fbbf24" } : {}} />}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#666", marginBottom: 4, letterSpacing: 2, fontWeight: 900 }}>WASTE <span style={{ color: "#444" }}>({player.waste.length})</span></div>
          {wasteTop ? <Card card={wasteTop} onClick={() => selected?.source === "waste" ? autoPlayF(selected) : selCard("waste", wasteTop)} selected={selected?.source === "waste"} /> : <EmptySlot label="" />}
        </div>
      </div>
    </div>
  );
}
