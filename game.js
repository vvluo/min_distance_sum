// ---- Board constants -------------------------------------------------------

const CELL = 56;
const N = 8;                 // 8x8 cells
const SIZE = N * CELL;       // 448
const CENTER = N / 2;        // vertex index that displays as (0,0)
const EX_CELL = 24;          // mini board used in the rules examples
const SVG_NS = "http://www.w3.org/2000/svg";

const PLAYERS = [
  { id: 0, name: "Red",    css: "red",    solid: "var(--red-solid)",    qx: [1, 3], qy: [1, 3] },
  { id: 1, name: "Blue",   css: "blue",   solid: "var(--blue-solid)",   qx: [5, 7], qy: [1, 3] },
  { id: 2, name: "Green",  css: "green",  solid: "var(--green-solid)",  qx: [1, 3], qy: [5, 7] },
  { id: 3, name: "Yellow", css: "yellow", solid: "var(--yellow-solid)", qx: [5, 7], qy: [5, 7] },
];

const TOTAL_ROUNDS = 9;

// ---- Helpers -----------------------------------------------------------

const key = (x, y) => `${x},${y}`;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round6 = (v) => Math.round(v * 1e6) / 1e6;
const disp = (x, y) => [x - CENTER, y - CENTER];
const dispStr = (x, y) => { const [dx, dy] = disp(x, y); return `(${dx}, ${dy})`; };

function masterPoolAll() {
  const list = [];
  for (let x = 1; x <= 7; x++) for (let y = 1; y <= 7; y++) list.push([x, y]);
  return list;
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
function genRoomCode(len = 5) {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}
const hostPeerId = (code) => `mds-room-${code}`;
const genSessionId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ---- SVG board rendering (shared by the live game and the rules examples) --

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function boardBase(cell, idAttr) {
  const size = N * cell;
  const attrs = { width: size, height: size, viewBox: `0 0 ${size} ${size}` };
  if (idAttr) attrs.id = idAttr;
  const svg = svgEl("svg", attrs);

  PLAYERS.forEach((p) => {
    const x0 = (p.qx[0] - 1) * cell;
    const y0 = (p.qy[0] - 1) * cell;
    svg.appendChild(svgEl("rect", { x: x0, y: y0, width: 4 * cell, height: 4 * cell, fill: `var(--${p.css})` }));
  });

  for (let i = 0; i <= N; i++) {
    svg.appendChild(svgEl("line", { x1: i * cell, y1: 0, x2: i * cell, y2: size, stroke: "white", "stroke-width": Math.max(1.5, cell / 18) }));
    svg.appendChild(svgEl("line", { x1: 0, y1: i * cell, x2: size, y2: i * cell, stroke: "white", "stroke-width": Math.max(1.5, cell / 18) }));
  }
  svg.appendChild(svgEl("rect", { x: 0, y: 0, width: size, height: size, fill: "none", stroke: "white", "stroke-width": Math.max(1.5, cell / 18) }));

  return svg;
}

// picks: array(4) of [x,y]|null (only what the viewer is allowed to see); masterVertex: [x,y]|null
function buildBoard({ mySlot, usedOwnKeys, picks, masterVertex, onPick }) {
  const svg = boardBase(CELL, "board");
  const activePlayer = mySlot != null ? PLAYERS[mySlot] : null;
  const inRegion = (p, x, y) => x >= p.qx[0] && x <= p.qx[1] && y >= p.qy[0] && y <= p.qy[1];

  // Only a player's own past picks gray out / block a vertex — a vertex that
  // merely happened to be the master in some earlier round is not "used" by
  // anyone and must stay pickable (master draws are already without
  // replacement via the pre-shuffled sequence, independent of this).
  const usedSet = new Set();
  (usedOwnKeys || []).forEach((arr) => arr.forEach((k) => usedSet.add(k)));

  // Playing directly on the master vertex is disallowed unless it's the
  // player's only remaining vertex — mirrors the same rule enforced in
  // actionPick, computed here from the mine-only usedOwnKeys[mySlot] count.
  const myAvailableCount = mySlot != null && usedOwnKeys ? 9 - usedOwnKeys[mySlot].length : null;

  let masterIsMyOnlyMove = false;

  for (let x = 1; x <= 7; x++) {
    for (let y = 1; y <= 7; y++) {
      const k = key(x, y);
      const px = x * CELL, py = y * CELL;
      const usedHere = usedSet.has(k);
      const isMasterHere = masterVertex && x === masterVertex[0] && y === masterVertex[1];
      const blockedByMaster = isMasterHere && myAvailableCount != null && myAvailableCount > 1;

      let clickable = false, fill = "rgba(255,255,255,0.9)", stroke = "rgba(0,0,0,0.15)", r = 4;
      if (usedHere) { fill = "rgba(90,90,95,0.55)"; stroke = "rgba(90,90,95,0.7)"; }
      if (onPick && activePlayer && inRegion(activePlayer, x, y) && !usedHere && !blockedByMaster) {
        clickable = true; fill = activePlayer.solid; stroke = "white"; r = 7;
      }
      if (clickable && isMasterHere) masterIsMyOnlyMove = true;

      const circle = svgEl("circle", { cx: px, cy: py, r, fill, stroke, "stroke-width": 1.5, class: "vertex" + (clickable ? " clickable" : "") });
      if (clickable) circle.addEventListener("click", () => onPick(x, y));
      svg.appendChild(circle);
    }
  }

  // Overlay markers are display-only — pointer-events:none lets a click on a
  // vertex that coincides with the master (or, at reveal, another pick)
  // still reach the actual clickable circle underneath instead of the marker.
  if (picks) {
    picks.forEach((pt, pid) => {
      if (!pt) return;
      const p = PLAYERS[pid];
      svg.appendChild(svgEl("circle", { cx: pt[0] * CELL, cy: pt[1] * CELL, r: 9, fill: p.solid, stroke: "white", "stroke-width": 2, "pointer-events": "none" }));
    });
  }
  if (masterVertex) {
    svg.appendChild(svgEl("circle", { cx: masterVertex[0] * CELL, cy: masterVertex[1] * CELL, r: 10, fill: "black", stroke: "white", "stroke-width": 2, "pointer-events": "none" }));
    // The master's larger black dot would otherwise completely hide the
    // smaller clickable vertex beneath it — surface it again on top so it's
    // obvious this forced move is still selectable, not just informational.
    if (masterIsMyOnlyMove) {
      svg.appendChild(svgEl("circle", { cx: masterVertex[0] * CELL, cy: masterVertex[1] * CELL, r: 5, fill: activePlayer.solid, stroke: "white", "stroke-width": 1.5, "pointer-events": "none" }));
    }
  }
  return svg;
}

// ============================================================================
// Networking: one browser tab is the authoritative "host", others are guests.
// Transport is WebRTC via PeerJS (works as a static page — no server needed,
// which is what lets this run unmodified from a local file server today and
// from GitHub Pages later). The host holds the real game state in memory and
// pushes a per-player filtered "view" to everyone (including itself) after
// every change; guests only ever act by sending messages to the host.
// ============================================================================

let uiPhase = "landing";     // landing | hostForm | joinForm | connecting | joinError | connected
let submitting = false;      // guards against double-submit spawning duplicate Peer connections
let joinErrorMsg = "";
let peer = null;
let isHost = false;
let room = null;             // host-only authoritative state
let connMap = null;          // host-only: DataConnection -> participant
let myParticipant = null;    // host-only: this tab's own participant object
let myConn = null;           // guest-only: DataConnection to the host
let mySlot = null;
let myView = null;           // latest state view driving render(), for both roles
let roomCode = null;

function createRoom(code) {
  return {
    code,
    phase: "lobby", // lobby | picking | revealReady | reveal | gameover
    slots: [null, null, null, null],
    round: 1,
    masterSequence: shuffled(masterPoolAll()),
    usedOwnKeys: [new Set(), new Set(), new Set(), new Set()],
    totals: [0, 0, 0, 0],
    history: [],
    currentPicks: [null, null, null, null],
    lockedIn: [false, false, false, false],
    readyReveal: [false, false, false, false],
    readyContinue: [false, false, false, false],
  };
}

function buildView(forSlot) {
  const master = room.masterSequence[room.round - 1];
  const showMaster = room.phase === "picking" || room.phase === "revealReady" || room.phase === "reveal";
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    totalRounds: TOTAL_ROUNDS,
    mySlot: forSlot,
    players: room.slots.map((s) => (s ? { name: s.name, connected: s.connected, lobbyReady: s.lobbyReady, isBot: !!s.isBot } : null)),
    botCount: room.slots.filter((s) => s && s.isBot).length,
    totals: room.totals.slice(),
    usedOwnKeys: room.usedOwnKeys.map((set) => [...set]),
    masterVertex: showMaster ? master : null,
    lockedIn: room.lockedIn.slice(),
    readyReveal: room.readyReveal.slice(),
    readyContinue: room.readyContinue.slice(),
    myPick: forSlot != null ? room.currentPicks[forSlot] : null,
    revealPicks: room.phase === "reveal" || room.phase === "gameover" ? room.currentPicks.slice() : null,
    lastRoundResult: room.history.length ? room.history[room.history.length - 1] : null,
  };
}

function broadcastState() {
  room.slots.forEach((p, slot) => {
    if (!p) return;
    const view = buildView(slot);
    if (p.isHost) {
      myView = view;
      render();
    } else if (p.conn && p.connected) {
      try { p.conn.send({ t: "state", view }); } catch (e) { /* connection likely closing */ }
    }
  });
}

// ---- Host-side action handlers (pure-ish; mutate `room`, then broadcast) --

function actionChooseSlot(participant, targetSlot) {
  if (room.phase !== "lobby") return;
  if (targetSlot < 0 || targetSlot > 3 || room.slots[targetSlot]) return;
  const curIdx = room.slots.indexOf(participant);
  if (curIdx === -1) return;
  participant.lobbyReady = false;
  room.slots[targetSlot] = participant;
  room.slots[curIdx] = null;
  broadcastState();
}

function actionToggleReady(participant) {
  if (room.phase !== "lobby") return;
  participant.lobbyReady = !participant.lobbyReady;
  if (room.slots.every((s) => s && s.lobbyReady)) room.phase = "picking";
  broadcastState();
  maybeRunBots();
}

const BOT_DIFFICULTIES = ["easy", "medium"];

function actionAddBot(participant, targetSlot, difficulty) {
  if (room.phase !== "lobby") return;
  if (targetSlot < 0 || targetSlot > 3 || room.slots[targetSlot]) return;
  const botCount = room.slots.filter((s) => s && s.isBot).length;
  if (botCount >= 3) return; // at least one seat has to stay open for a human
  const diff = BOT_DIFFICULTIES.includes(difficulty) ? difficulty : "easy";
  room.slots[targetSlot] = {
    sessionId: "bot-" + targetSlot + "-" + genSessionId(),
    name: diff === "medium" ? "Bot (Medium)" : "Bot (Easy)",
    conn: null, connected: true, lobbyReady: true, isBot: true, difficulty: diff,
  };
  broadcastState();
}

function actionRemoveBot(participant, targetSlot) {
  if (room.phase !== "lobby") return;
  const s = room.slots[targetSlot];
  if (!s || !s.isBot) return;
  room.slots[targetSlot] = null;
  broadcastState();
}

function actionPick(participant, x, y) {
  if (room.phase !== "picking") return;
  const slot = room.slots.indexOf(participant);
  if (slot === -1 || room.lockedIn[slot]) return;
  const player = PLAYERS[slot];
  const inRegion = x >= player.qx[0] && x <= player.qx[1] && y >= player.qy[0] && y <= player.qy[1];
  if (!inRegion || room.usedOwnKeys[slot].has(key(x, y))) return;

  // Playing directly on the master vertex is disallowed unless it's the
  // player's only remaining vertex — i.e. they have no other legal move.
  const master = room.masterSequence[room.round - 1];
  if (x === master[0] && y === master[1] && availableVertices(slot).length > 1) return;

  room.currentPicks[slot] = [x, y];
  room.lockedIn[slot] = true;
  if (room.lockedIn.every(Boolean)) room.phase = "revealReady";
  broadcastState();
  maybeRunBots();
}

// ---- Bots: simulated purely on the host, no connection of their own -------

function availableVertices(slot) {
  const player = PLAYERS[slot];
  const available = [];
  for (let x = player.qx[0]; x <= player.qx[1]; x++) {
    for (let y = player.qy[0]; y <= player.qy[1]; y++) {
      if (!room.usedOwnKeys[slot].has(key(x, y))) available.push([x, y]);
    }
  }
  return available;
}

// Vertices a player may actually pick this round — excludes the master
// vertex itself unless it's their only remaining vertex, mirroring the same
// rule actionPick enforces for human players.
function pickableVertices(slot) {
  const all = availableVertices(slot);
  if (all.length <= 1) return all;
  const master = room.masterSequence[room.round - 1];
  return all.filter((v) => v[0] !== master[0] || v[1] !== master[1]);
}

function randomAvailableVertex(slot) {
  const available = pickableVertices(slot);
  return available[Math.floor(Math.random() * available.length)];
}

// Medium bot: always plays whichever of its own remaining vertices is
// closest to the master vertex. Ties go to whichever of those is furthest
// from the board's center (0,0); if that's still tied, pick randomly.
function mediumBotVertex(slot) {
  const available = pickableVertices(slot);
  const master = room.masterSequence[room.round - 1];
  const distToOrigin = (v) => Math.hypot(...disp(v[0], v[1]));

  let best = round6(Math.min(...available.map((v) => dist(v, master))));
  let candidates = available.filter((v) => round6(dist(v, master)) === best);

  if (candidates.length > 1) {
    const farthest = round6(Math.max(...candidates.map(distToOrigin)));
    candidates = candidates.filter((v) => round6(distToOrigin(v)) === farthest);
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

function botVertexFor(s, slot) {
  return s.difficulty === "medium" ? mediumBotVertex(slot) : randomAvailableVertex(slot);
}

function maybeRunBots() {
  if (!room) return;
  if (room.phase === "picking") {
    room.slots.forEach((s, slot) => {
      if (!s || !s.isBot || room.lockedIn[slot]) return;
      setTimeout(() => {
        if (!room || room.phase !== "picking" || room.lockedIn[slot] || room.slots[slot] !== s) return;
        const [x, y] = botVertexFor(s, slot);
        actionPick(s, x, y);
      }, 300 + Math.random() * 900);
    });
  } else if (room.phase === "revealReady") {
    room.slots.forEach((s, slot) => {
      if (!s || !s.isBot || room.readyReveal[slot]) return;
      setTimeout(() => {
        if (!room || room.phase !== "revealReady" || room.readyReveal[slot] || room.slots[slot] !== s) return;
        actionReadyReveal(s);
      }, 200 + Math.random() * 500);
    });
  } else if (room.phase === "reveal") {
    room.slots.forEach((s, slot) => {
      if (!s || !s.isBot || room.readyContinue[slot]) return;
      setTimeout(() => {
        if (!room || room.phase !== "reveal" || room.readyContinue[slot] || room.slots[slot] !== s) return;
        actionReadyContinue(s);
      }, 200 + Math.random() * 500);
    });
  }
}

// Balance rule: a master vertex strictly inside one player's own region
// penalizes that player (+2) and gives their diagonal opponent a bonus (-1);
// one sitting exactly on the shared edge between two regions penalizes both
// of those players (+1 each), with no diagonal bonus. The single center
// point where all four regions meet belongs to none of them, so it's neutral.
const DIAGONAL_SLOT = [3, 2, 1, 0]; // Red<->Yellow, Blue<->Green

function regionPenalties(vertex) {
  const [x, y] = vertex;
  const onXBoundary = x === CENTER;
  const onYBoundary = y === CENTER;
  const penalties = [0, 0, 0, 0];
  if (onXBoundary && onYBoundary) return penalties; // four-way center: neutral
  if (onXBoundary) {
    const [a, b] = y < CENTER ? [0, 1] : [2, 3];
    penalties[a] = 1; penalties[b] = 1;
  } else if (onYBoundary) {
    const [a, b] = x < CENTER ? [0, 2] : [1, 3];
    penalties[a] = 1; penalties[b] = 1;
  } else {
    const slot = PLAYERS.findIndex((p) => x >= p.qx[0] && x <= p.qx[1] && y >= p.qy[0] && y <= p.qy[1]);
    penalties[slot] = 2;
    penalties[DIAGONAL_SLOT[slot]] -= 1;
  }
  return penalties;
}

function formatPenalty(p) {
  if (p > 0) return `+${p}`;
  if (p < 0) return `${p}`;
  return "—";
}

function penaltyExplanation(master, penalties) {
  const positive = PLAYERS.filter((p) => penalties[p.id] > 0);
  const negative = PLAYERS.filter((p) => penalties[p.id] < 0);
  if (positive.length === 0 && negative.length === 0) return " — the center point, shared by all four regions (no penalty)";
  const parts = [];
  if (positive.length === 1) {
    parts.push(`inside ${positive[0].name}'s region (${formatPenalty(penalties[positive[0].id])})`);
  } else if (positive.length === 2) {
    parts.push(`on the border between ${positive.map((p) => p.name).join(" and ")} (${formatPenalty(penalties[positive[0].id])} each)`);
  }
  if (negative.length === 1) {
    parts.push(`${negative[0].name} gets a diagonal bonus (${formatPenalty(penalties[negative[0].id])})`);
  }
  return " — " + parts.join("; ");
}

function doReveal() {
  const master = room.masterSequence[room.round - 1];
  const picks = room.currentPicks;
  const penalties = regionPenalties(master);
  const baseScores = picks.map((pt, i) => {
    const others = [master, ...picks.filter((_, j) => j !== i)];
    return round6(Math.min(...others.map((o) => dist(pt, o))));
  });
  const scores = baseScores.map((s, i) => round6(s + penalties[i]));
  scores.forEach((s, i) => (room.totals[i] += s));
  room.history.push({ round: room.round, master, picks: picks.slice(), baseScores, penalties, scores });
  room.phase = "reveal";
  room.readyReveal = [false, false, false, false];
}

function actionReadyReveal(participant) {
  if (room.phase !== "revealReady") return;
  const slot = room.slots.indexOf(participant);
  if (slot === -1) return;
  room.readyReveal[slot] = true;
  if (room.readyReveal.every(Boolean)) doReveal();
  broadcastState();
  maybeRunBots();
}

function advanceRound() {
  // Grays out this round's vertices only now — everyone already saw the
  // reveal together, so there's nothing left to leak by marking them.
  room.currentPicks.forEach((pt, slot) => room.usedOwnKeys[slot].add(key(...pt)));
  room.readyContinue = [false, false, false, false];
  room.lockedIn = [false, false, false, false];
  room.currentPicks = [null, null, null, null];
  if (room.round >= TOTAL_ROUNDS) room.phase = "gameover";
  else { room.round++; room.phase = "picking"; }
}

function actionReadyContinue(participant) {
  if (room.phase !== "reveal") return;
  const slot = room.slots.indexOf(participant);
  if (slot === -1) return;
  room.readyContinue[slot] = true;
  if (room.readyContinue.every(Boolean)) advanceRound();
  broadcastState();
  maybeRunBots();
}

function dispatchAction(participant, msg) {
  switch (msg.t) {
    case "chooseSlot": return actionChooseSlot(participant, msg.slot);
    case "toggleReady": return actionToggleReady(participant);
    case "addBot": return actionAddBot(participant, msg.slot, msg.difficulty);
    case "removeBot": return actionRemoveBot(participant, msg.slot);
    case "pick": return actionPick(participant, msg.x, msg.y);
    case "readyReveal": return actionReadyReveal(participant);
    case "readyContinue": return actionReadyContinue(participant);
  }
}

function handleJoin(conn, msg) {
  let participant = null;
  if (msg.sessionId) participant = room.slots.find((s) => s && s.sessionId === msg.sessionId) || null;

  if (participant) {
    participant.conn = conn;
    participant.connected = true;
    if (msg.name) participant.name = msg.name;
  } else {
    let freeIndex = room.slots.findIndex((s) => s === null);
    // Before the game starts, a disconnected player's slot can be claimed by
    // a new joiner (e.g. they refreshed without their old session, or gave up).
    if (freeIndex === -1 && room.phase === "lobby") freeIndex = room.slots.findIndex((s) => s && !s.connected);
    if (freeIndex === -1) { try { conn.send({ t: "joinError", reason: "Room is full (4/4 players already joined)." }); } catch (e) {} return; }
    participant = { sessionId: msg.sessionId || genSessionId(), name: msg.name || "Player", conn, connected: true, lobbyReady: false };
    room.slots[freeIndex] = participant;
  }
  connMap.set(conn, participant);
  const slot = room.slots.indexOf(participant);
  try { conn.send({ t: "joined", slot, sessionId: participant.sessionId }); } catch (e) {}
  broadcastState();
}

function handleGuestMessage(conn, msg) {
  if (msg.t === "join") return handleJoin(conn, msg);
  const participant = connMap.get(conn);
  if (!participant) return;
  dispatchAction(participant, msg);
}

function sendAction(msg) {
  if (isHost) dispatchAction(myParticipant, msg);
  else if (myConn) { try { myConn.send(msg); } catch (e) {} }
}

// ---- Host bootstrap --------------------------------------------------------

function startAsHost(name) {
  if (submitting) return;
  submitting = true;
  uiPhase = "connecting";
  render();

  const code = genRoomCode();
  isHost = true;
  connMap = new Map();
  peer = new Peer(hostPeerId(code));

  peer.on("open", () => {
    roomCode = code;
    room = createRoom(code);
    myParticipant = { sessionId: "host-self", name, conn: null, connected: true, lobbyReady: false, isHost: true };
    room.slots[0] = myParticipant;
    mySlot = 0;
    uiPhase = "connected";
    submitting = false;
    broadcastState();
  });

  peer.on("connection", (conn) => {
    conn.on("data", (msg) => handleGuestMessage(conn, msg));
    conn.on("close", () => {
      const p = connMap.get(conn);
      if (p) { p.connected = false; broadcastState(); }
    });
  });

  peer.on("error", (err) => {
    if (err.type === "unavailable-id") { submitting = false; startAsHost(name); return; } // extremely rare code collision, retry
    submitting = false;
    uiPhase = "joinError";
    joinErrorMsg = "Could not start the room (" + err.type + "). Check your connection and try again.";
    render();
  });
}

// ---- Guest bootstrap --------------------------------------------------------

function startAsGuest(code, name) {
  if (submitting) return;
  submitting = true;
  uiPhase = "connecting";
  render();

  roomCode = code;
  isHost = false;
  const storageKey = "mds-session-" + code;
  const sessionId = localStorage.getItem(storageKey);
  peer = new Peer();

  peer.on("open", () => {
    const conn = peer.connect(hostPeerId(code), { reliable: true });
    myConn = conn;

    conn.on("open", () => conn.send({ t: "join", name, sessionId }));

    conn.on("data", (msg) => {
      if (msg.t === "joined") {
        localStorage.setItem(storageKey, msg.sessionId);
        mySlot = msg.slot;
        uiPhase = "connected";
        submitting = false;
        render();
      } else if (msg.t === "joinError") {
        submitting = false;
        uiPhase = "joinError";
        joinErrorMsg = msg.reason;
        render();
      } else if (msg.t === "state") {
        myView = msg.view;
        mySlot = msg.view.mySlot;
        render();
      }
    });

    conn.on("close", () => {
      if (uiPhase === "connected") {
        uiPhase = "joinError";
        joinErrorMsg = "Lost connection to the host. They may have closed the game.";
        render();
      }
    });
  });

  peer.on("error", (err) => {
    submitting = false;
    uiPhase = "joinError";
    if (err.type === "peer-unavailable") {
      joinErrorMsg = "No game found for that code. Double check it, and make sure the host still has the game open.";
    } else {
      joinErrorMsg = "Connection error (" + err.type + "). Check your connection and try again.";
    }
    render();
  });
}

// ---- Rendering: screens -----------------------------------------------

const stage = document.getElementById("stage");
function clearStage() { stage.innerHTML = ""; }

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "text") e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  children.forEach((c) => e.appendChild(c));
  return e;
}

function render() {
  clearStage();
  renderScoreboard();

  if (uiPhase !== "connected") return renderPreGame();

  switch (myView.phase) {
    case "lobby": return renderLobby();
    case "picking": return renderPicking();
    case "revealReady": return renderRevealReady();
    case "reveal": return renderReveal();
    case "gameover": return renderGameOver();
  }
}

// ---- Pre-game screens (landing / host / join / connecting / error) --------

function renderPreGame() {
  if (uiPhase === "landing") return renderLanding();
  if (uiPhase === "hostForm") return renderHostForm();
  if (uiPhase === "joinForm") return renderJoinForm();
  if (uiPhase === "connecting") return renderConnecting();
  if (uiPhase === "joinError") return renderJoinErrorScreen();
}

function renderLanding() {
  stage.appendChild(el("div", { class: "stage-title", text: "Play with friends" }));
  stage.appendChild(el("div", { class: "stage-sub", text: "One player hosts and shares a link or code; up to 3 more join from their own devices. Fill any empty seats with bots to play solo or in a smaller group." }));
  const row = el("div", { class: "landing-actions" });
  const hostBtn = el("button", { text: "Host a Game" });
  hostBtn.addEventListener("click", () => { uiPhase = "hostForm"; render(); });
  const joinBtn = el("button", { text: "Join a Game", class: "secondary" });
  joinBtn.addEventListener("click", () => { uiPhase = "joinForm"; render(); });
  row.appendChild(hostBtn);
  row.appendChild(joinBtn);
  stage.appendChild(row);
}

function nameInputRow(placeholder, onSubmit) {
  const wrap = el("div", { class: "form-row" });
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.maxLength = 20;
  input.className = "text-input";
  wrap.appendChild(input);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") onSubmit(input.value); });
  return { wrap, input };
}

function renderHostForm() {
  stage.appendChild(el("div", { class: "stage-title", text: "Host a Game" }));
  stage.appendChild(el("div", { class: "stage-sub", text: "Pick a name — you'll get a room code and link to share with the other 3 players." }));
  const { wrap, input } = nameInputRow("Your name", submit);
  stage.appendChild(wrap);
  const btn = el("button", { text: "Create Room" });
  function submit(val) {
    const name = (val || "").trim() || "Host";
    startAsHost(name);
  }
  btn.addEventListener("click", () => submit(input.value));
  stage.appendChild(btn);
  const back = el("button", { text: "Back", class: "secondary" });
  back.addEventListener("click", () => { uiPhase = "landing"; render(); });
  stage.appendChild(back);
  input.focus();
}

function renderJoinForm() {
  stage.appendChild(el("div", { class: "stage-title", text: "Join a Game" }));
  const urlCode = new URLSearchParams(location.search).get("room");
  stage.appendChild(el("div", { class: "stage-sub", text: urlCode ? "Joining room " + urlCode.toUpperCase() + " — enter your name." : "Enter the room code and your name." }));

  const codeWrap = el("div", { class: "form-row" });
  const codeInput = document.createElement("input");
  codeInput.type = "text";
  codeInput.placeholder = "Room code";
  codeInput.maxLength = 5;
  codeInput.className = "text-input code-input";
  codeInput.value = urlCode ? urlCode.toUpperCase() : "";
  codeInput.addEventListener("input", () => { codeInput.value = codeInput.value.toUpperCase(); });
  codeWrap.appendChild(codeInput);
  stage.appendChild(codeWrap);

  const { wrap, input: nameInput } = nameInputRow("Your name", () => submit());
  stage.appendChild(wrap);

  function submit() {
    const code = codeInput.value.trim().toUpperCase();
    const name = (nameInput.value || "").trim() || "Player";
    if (!code) { codeInput.focus(); return; }
    startAsGuest(code, name);
  }

  const btn = el("button", { text: "Join Room" });
  btn.addEventListener("click", submit);
  stage.appendChild(btn);
  const back = el("button", { text: "Back", class: "secondary" });
  back.addEventListener("click", () => { uiPhase = "landing"; render(); });
  stage.appendChild(back);

  if (urlCode) nameInput.focus(); else codeInput.focus();
}

function renderConnecting() {
  stage.appendChild(el("div", { class: "stage-title", text: "Connecting…" }));
  stage.appendChild(el("div", { class: "stage-sub", text: "This can take a few seconds." }));
}

function renderJoinErrorScreen() {
  stage.appendChild(el("div", { class: "stage-title", text: "Couldn't connect" }));
  stage.appendChild(el("div", { class: "stage-sub error-text", text: joinErrorMsg }));
  const btn = el("button", { text: "Back" });
  btn.addEventListener("click", () => { uiPhase = "landing"; render(); });
  stage.appendChild(btn);
}

// ---- Lobby ------------------------------------------------------------

function renderLobby() {
  const v = myView;
  stage.appendChild(el("div", { class: "stage-title", text: "Lobby — Room " + v.code }));

  const link = `${location.origin}${location.pathname}?room=${v.code}`;
  const shareWrap = el("div", { class: "share-row" });
  const linkInput = document.createElement("input");
  linkInput.type = "text";
  linkInput.readOnly = true;
  linkInput.value = link;
  linkInput.className = "text-input";
  linkInput.addEventListener("click", () => linkInput.select());
  const copyBtn = el("button", { text: "Copy Link", class: "secondary" });
  copyBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(link); copyBtn.textContent = "Copied!"; }
    catch (e) { linkInput.select(); document.execCommand("copy"); copyBtn.textContent = "Copied!"; }
    setTimeout(() => (copyBtn.textContent = "Copy Link"), 1500);
  });
  shareWrap.appendChild(linkInput);
  shareWrap.appendChild(copyBtn);
  stage.appendChild(shareWrap);
  stage.appendChild(el("div", { class: "stage-sub", text: `Or share the code: ${v.code}` }));

  const slotsWrap = el("div", { class: "lobby-slots" });
  PLAYERS.forEach((p, i) => {
    const occ = v.players[i];
    const card = el("div", { class: "lobby-slot" + (occ ? " filled" : " empty") + (i === v.mySlot ? " mine" : "") });
    card.style.borderColor = p.solid;
    const dot = el("span", { class: "player-dot" });
    dot.style.background = p.solid;
    const label = el("div", { class: "lobby-slot-label" }, [dot, document.createTextNode(" " + p.name)]);
    card.appendChild(label);
    if (occ) {
      const nameText = occ.isBot ? "\u{1F916} " + occ.name : occ.name + (occ.connected ? "" : " (disconnected)");
      card.appendChild(el("div", { class: "lobby-slot-name", text: nameText }));
      card.appendChild(el("div", { class: "lobby-slot-ready", text: occ.isBot ? "Ready" : (occ.lobbyReady ? "Ready" : "Not ready") }));
      if (occ.isBot) {
        const removeBtn = el("button", { text: "Remove Bot", class: "secondary small" });
        removeBtn.addEventListener("click", () => sendAction({ t: "removeBot", slot: i }));
        card.appendChild(removeBtn);
      }
    } else {
      card.appendChild(el("div", { class: "lobby-slot-name", text: "Open" }));
      const btnRow = el("div", { class: "lobby-slot-actions" });
      if (v.mySlot != null && v.players[v.mySlot] && !v.players[v.mySlot].lobbyReady) {
        const moveBtn = el("button", { text: "Play as " + p.name, class: "secondary small" });
        moveBtn.addEventListener("click", () => sendAction({ t: "chooseSlot", slot: i }));
        btnRow.appendChild(moveBtn);
      }
      if (v.botCount < 3) {
        const easyBtn = el("button", { text: "+ Easy Bot", class: "secondary small" });
        easyBtn.addEventListener("click", () => sendAction({ t: "addBot", slot: i, difficulty: "easy" }));
        btnRow.appendChild(easyBtn);
        const mediumBtn = el("button", { text: "+ Medium Bot", class: "secondary small" });
        mediumBtn.addEventListener("click", () => sendAction({ t: "addBot", slot: i, difficulty: "medium" }));
        btnRow.appendChild(mediumBtn);
      }
      card.appendChild(btnRow);
    }
    slotsWrap.appendChild(card);
  });
  stage.appendChild(slotsWrap);

  const readyCount = v.players.filter((p) => p && p.lobbyReady).length;
  const filledCount = v.players.filter(Boolean).length;
  const humanCount = v.players.filter((p) => p && !p.isBot).length;
  stage.appendChild(el("div", { class: "stage-sub", text: `${filledCount}/4 seats filled • ${readyCount}/4 ready • ${humanCount} human player(s), ${v.botCount} bot(s)` }));

  const me = v.mySlot != null ? v.players[v.mySlot] : null;
  const readyBtn = el("button", { text: me && me.lobbyReady ? "Not Ready" : "Ready" });
  readyBtn.addEventListener("click", () => sendAction({ t: "toggleReady" }));
  stage.appendChild(readyBtn);
}

// ---- In-game screens ----------------------------------------------------

function renderPicking() {
  const v = myView;
  const p = PLAYERS[v.mySlot];
  const lockedInCount = v.lockedIn.filter(Boolean).length;

  stage.appendChild(playerPillNamed(p, v.players[v.mySlot].name));
  const iLockedIn = v.lockedIn[v.mySlot];
  stage.appendChild(el("div", {
    class: "stage-sub",
    text: iLockedIn
      ? `You're locked in — waiting for ${4 - lockedInCount} more player(s).`
      : `Round ${v.round} of ${v.totalRounds} — pick one of your available vertices. Black dot is this round's master vertex.`,
  }));

  const masterInMyRegion = !iLockedIn && v.masterVertex && p.qx[0] <= v.masterVertex[0] && v.masterVertex[0] <= p.qx[1] && p.qy[0] <= v.masterVertex[1] && v.masterVertex[1] <= p.qy[1];
  const myAvailableCount = 9 - v.usedOwnKeys[v.mySlot].length;
  if (masterInMyRegion && myAvailableCount > 1) {
    stage.appendChild(el("div", { class: "stage-sub", text: "You can't play directly on the master vertex unless it's your only vertex left." }));
  }

  const picksDisplay = [null, null, null, null];
  if (v.myPick) picksDisplay[v.mySlot] = v.myPick;

  stage.appendChild(buildBoard({
    mySlot: v.mySlot,
    usedOwnKeys: v.usedOwnKeys,
    masterVertex: v.masterVertex,
    picks: picksDisplay,
    onPick: iLockedIn ? null : (x, y) => sendAction({ t: "pick", x, y }),
  }));
}

function renderRevealReady() {
  const v = myView;
  const readyCount = v.readyReveal.filter(Boolean).length;
  const iReady = v.readyReveal[v.mySlot];
  stage.appendChild(el("div", { class: "stage-title", text: `All 4 players have chosen — Round ${v.round}` }));
  stage.appendChild(el("div", { class: "stage-sub", text: iReady ? `Waiting for ${4 - readyCount} more player(s)…` : "Click Reveal when you're ready to see everyone's pick." }));
  if (!iReady) {
    const btn = el("button", { text: "Reveal" });
    btn.addEventListener("click", () => sendAction({ t: "readyReveal" }));
    stage.appendChild(btn);
  }
}

function renderReveal() {
  const v = myView;
  const h = v.lastRoundResult;
  stage.appendChild(el("div", { class: "stage-title", text: `Round ${h.round} results` }));
  stage.appendChild(buildBoard({ picks: h.picks, masterVertex: h.master }));

  const wrap = el("div", { class: "round-summary" });
  const table = el("table");
  table.appendChild(el("thead", {}, [el("tr", {}, [
    el("th", { text: "Player" }), el("th", { text: "Vertex" }), el("th", { text: "Min Dist" }), el("th", { text: "Penalty" }), el("th", { text: "Round Score" }), el("th", { text: "Total" }),
  ])]));
  const tbody = el("tbody");
  PLAYERS.forEach((p, i) => {
    tbody.appendChild(el("tr", {}, [
      el("td", {}, [playerPillNamed(p, v.players[i] ? v.players[i].name : p.name)]),
      el("td", { text: dispStr(h.picks[i][0], h.picks[i][1]) }),
      el("td", { text: h.baseScores[i].toFixed(3) }),
      el("td", { text: formatPenalty(h.penalties[i]) }),
      el("td", { text: h.scores[i].toFixed(3) }),
      el("td", { text: v.totals[i].toFixed(3) }),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  wrap.appendChild(el("div", { class: "stage-sub", text: `Master vertex: ${dispStr(h.master[0], h.master[1])}${penaltyExplanation(h.master, h.penalties)}`, style: "margin-top:10px" }));
  stage.appendChild(wrap);

  const readyCount = v.readyContinue.filter(Boolean).length;
  const iReady = v.readyContinue[v.mySlot];
  if (!iReady) {
    const btn = el("button", { text: v.round >= v.totalRounds ? "See Final Results" : "Continue to next round" });
    btn.addEventListener("click", () => sendAction({ t: "readyContinue" }));
    stage.appendChild(btn);
  } else {
    stage.appendChild(el("div", { class: "stage-sub", text: `Waiting for ${4 - readyCount} more player(s)…` }));
  }
}

function renderGameOver() {
  const v = myView;
  stage.appendChild(el("div", { class: "stage-title", text: "Game Over" }));
  const ranked = PLAYERS.map((p, i) => ({ p, name: v.players[i] ? v.players[i].name : p.name, total: v.totals[i] })).sort((a, b) => a.total - b.total);

  const board = el("div", { class: "final-board" });
  ranked.forEach((r, i) => {
    const row = el("div", { class: "final-row" + (i === 0 ? " winner" : "") });
    const left = el("span", {}, [playerPillNamed(r.p, r.name)]);
    if (i === 0) {
      const crown = document.createElement("span");
      crown.className = "crown";
      crown.textContent = "\u{1F3C6}";
      left.prepend(crown);
    }
    row.appendChild(left);
    row.appendChild(el("span", { text: r.total.toFixed(3) }));
    board.appendChild(row);
  });
  stage.appendChild(board);

  const btn = el("button", { text: "Leave Game" });
  btn.addEventListener("click", () => location.reload());
  stage.appendChild(btn);
}

function playerPillNamed(p, label) {
  const pill = el("span", { class: "player-pill" });
  const dot = el("span", { class: "player-dot" });
  dot.style.background = p.solid;
  pill.appendChild(dot);
  pill.appendChild(document.createTextNode(label));
  return pill;
}

function renderScoreboard() {
  const roundText = uiPhase === "connected" && myView ? `Room ${myView.code} — Round ${Math.min(myView.round, TOTAL_ROUNDS)} / ${TOTAL_ROUNDS}` : "Not connected";
  document.getElementById("round-indicator").textContent = roundText;

  const tbody = document.querySelector("#score-table tbody");
  tbody.innerHTML = "";
  PLAYERS.forEach((p, i) => {
    const name = uiPhase === "connected" && myView && myView.players[i] ? myView.players[i].name : p.name;
    const total = uiPhase === "connected" && myView ? myView.totals[i] : 0;
    const tr = document.createElement("tr");
    const nameTd = document.createElement("td");
    nameTd.appendChild(playerPillNamed(p, name));
    const totalTd = document.createElement("td");
    totalTd.textContent = total.toFixed(3);
    tr.appendChild(nameTd);
    tr.appendChild(totalTd);
    tbody.appendChild(tr);
  });
}

// ---- Rules panel: hover examples ------------------------------------------

const EXAMPLE_CAPTIONS = {
  own: "Red's 9 playable vertices — the 3×3 interior corners of their quadrant.",
  master: "A master vertex (black) is drawn from the board's 49 interior corners and shown to everyone before they pick. You can't play on it unless it's your only vertex left.",
  scoring: "Each player's score is their distance to the nearest of the other 4 points — sometimes another player, sometimes the master vertex.",
  penalty: "A master vertex inside a region penalizes that player and rewards their diagonal opponent; on a shared border it penalizes both neighbors instead.",
};

function buildExampleBoard(kind) {
  const svg = boardBase(EX_CELL);
  const red = PLAYERS[0];

  if (kind === "own" || kind === "master") {
    const x0 = (red.qx[0] - 1) * EX_CELL;
    const y0 = (red.qy[0] - 1) * EX_CELL;
    svg.appendChild(svgEl("rect", { x: x0, y: y0, width: 4 * EX_CELL, height: 4 * EX_CELL, fill: "none", stroke: red.solid, "stroke-width": 3 }));

    for (let x = 1; x <= 7; x++) {
      for (let y = 1; y <= 7; y++) {
        const inRed = x >= red.qx[0] && x <= red.qx[1] && y >= red.qy[0] && y <= red.qy[1];
        svg.appendChild(svgEl("circle", {
          cx: x * EX_CELL, cy: y * EX_CELL, r: inRed ? 6 : 3,
          fill: inRed ? red.solid : "rgba(255,255,255,0.9)",
          stroke: inRed ? "white" : "rgba(0,0,0,0.15)",
          "stroke-width": 1.2,
        }));
      }
    }

    if (kind === "master") {
      const m = [4, 3];
      svg.appendChild(svgEl("circle", { cx: m[0] * EX_CELL, cy: m[1] * EX_CELL, r: 7, fill: "black", stroke: "white", "stroke-width": 2 }));
    }
  }

  if (kind === "scoring") {
    for (let x = 1; x <= 7; x++) {
      for (let y = 1; y <= 7; y++) {
        svg.appendChild(svgEl("circle", { cx: x * EX_CELL, cy: y * EX_CELL, r: 2.5, fill: "rgba(255,255,255,0.7)", stroke: "rgba(0,0,0,0.12)", "stroke-width": 1 }));
      }
    }

    const examplePicks = [[2, 2], [5, 2], [3, 6], [6, 6]];
    const exampleMaster = [5, 3];

    const nearest = examplePicks.map((pt, i) => {
      const others = [exampleMaster, ...examplePicks.filter((_, j) => j !== i)];
      let best = null, bd = Infinity;
      others.forEach((o) => { const d = dist(pt, o); if (d < bd) { bd = d; best = o; } });
      return { to: best, dist: round6(bd) };
    });

    examplePicks.forEach((pt, i) => {
      const p = PLAYERS[i];
      const n = nearest[i];
      svg.appendChild(svgEl("line", {
        x1: pt[0] * EX_CELL, y1: pt[1] * EX_CELL, x2: n.to[0] * EX_CELL, y2: n.to[1] * EX_CELL,
        stroke: p.solid, "stroke-width": 1.5, "stroke-dasharray": "3,2",
      }));
    });

    svg.appendChild(svgEl("circle", { cx: exampleMaster[0] * EX_CELL, cy: exampleMaster[1] * EX_CELL, r: 7, fill: "black", stroke: "white", "stroke-width": 2 }));

    examplePicks.forEach((pt, i) => {
      const p = PLAYERS[i];
      svg.appendChild(svgEl("circle", { cx: pt[0] * EX_CELL, cy: pt[1] * EX_CELL, r: 6, fill: p.solid, stroke: "white", "stroke-width": 1.5 }));
    });

    examplePicks.forEach((pt, i) => {
      const n = nearest[i];
      const midx = ((pt[0] + n.to[0]) / 2) * EX_CELL;
      const midy = ((pt[1] + n.to[1]) / 2) * EX_CELL;
      const t = svgEl("text", { x: midx, y: midy - 4, "font-size": 9, fill: "#333", "text-anchor": "middle" });
      t.textContent = n.dist.toFixed(3);
      svg.appendChild(t);
    });
  }

  if (kind === "penalty") {
    const blue = PLAYERS[1];
    const yellow = PLAYERS[3];
    [red, blue, yellow].forEach((p) => {
      const x0 = (p.qx[0] - 1) * EX_CELL;
      const y0 = (p.qy[0] - 1) * EX_CELL;
      svg.appendChild(svgEl("rect", { x: x0, y: y0, width: 4 * EX_CELL, height: 4 * EX_CELL, fill: "none", stroke: p.solid, "stroke-width": 3 }));
    });

    for (let x = 1; x <= 7; x++) {
      for (let y = 1; y <= 7; y++) {
        svg.appendChild(svgEl("circle", { cx: x * EX_CELL, cy: y * EX_CELL, r: 2.5, fill: "rgba(255,255,255,0.7)", stroke: "rgba(0,0,0,0.12)", "stroke-width": 1 }));
      }
    }

    const interior = [2, 2];
    const border = [4, 2];
    const diagonal = [6, 6]; // Yellow, diagonally opposite Red

    svg.appendChild(svgEl("line", {
      x1: interior[0] * EX_CELL, y1: interior[1] * EX_CELL, x2: diagonal[0] * EX_CELL, y2: diagonal[1] * EX_CELL,
      stroke: "rgba(0,0,0,0.3)", "stroke-width": 1, "stroke-dasharray": "3,2",
    }));

    [interior, border].forEach((pt) => {
      svg.appendChild(svgEl("circle", { cx: pt[0] * EX_CELL, cy: pt[1] * EX_CELL, r: 7, fill: "black", stroke: "white", "stroke-width": 2 }));
    });
    svg.appendChild(svgEl("circle", { cx: diagonal[0] * EX_CELL, cy: diagonal[1] * EX_CELL, r: 6, fill: yellow.solid, stroke: "white", "stroke-width": 2 }));

    const t1 = svgEl("text", { x: interior[0] * EX_CELL, y: interior[1] * EX_CELL - 12, "font-size": 9, fill: "#333", "text-anchor": "middle" });
    t1.textContent = "Red +2";
    svg.appendChild(t1);

    const t2 = svgEl("text", { x: border[0] * EX_CELL, y: border[1] * EX_CELL - 12, "font-size": 9, fill: "#333", "text-anchor": "middle" });
    t2.textContent = "+1 each";
    svg.appendChild(t2);

    const t3 = svgEl("text", { x: diagonal[0] * EX_CELL, y: diagonal[1] * EX_CELL - 11, "font-size": 9, fill: "#333", "text-anchor": "middle" });
    t3.textContent = "Yellow −1";
    svg.appendChild(t3);
  }

  return svg;
}

function showRuleExample(kind, container) {
  container.innerHTML = "";
  container.appendChild(buildExampleBoard(kind));
  const caption = document.createElement("div");
  caption.className = "rules-example-caption";
  caption.textContent = EXAMPLE_CAPTIONS[kind] || "";
  container.appendChild(caption);
}

function clearRuleExample(container) {
  container.innerHTML = '<div class="rules-example-hint">Hover a rule above to see an example</div>';
}

function setupRulesExamples() {
  const container = document.getElementById("rules-example");
  if (!container) return;
  const items = document.querySelectorAll("#rules-list li[data-example]");
  items.forEach((li) => {
    li.addEventListener("mouseenter", () => showRuleExample(li.dataset.example, container));
    li.addEventListener("mouseleave", () => clearRuleExample(container));
  });
}

// ---- Boot ----------------------------------------------------------------

const urlRoom = new URLSearchParams(location.search).get("room");
if (urlRoom) uiPhase = "joinForm";
render();
setupRulesExamples();
