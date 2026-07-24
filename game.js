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
function buildBoard({ mySlot, usedOwnKeys, usedMasterKeys, picks, masterVertex, onPick }) {
  const svg = boardBase(CELL, "board");
  const activePlayer = mySlot != null ? PLAYERS[mySlot] : null;
  const inRegion = (p, x, y) => x >= p.qx[0] && x <= p.qx[1] && y >= p.qy[0] && y <= p.qy[1];

  const usedSet = new Set();
  (usedOwnKeys || []).forEach((arr) => arr.forEach((k) => usedSet.add(k)));
  const masterUsedSet = new Set(usedMasterKeys || []);

  for (let x = 1; x <= 7; x++) {
    for (let y = 1; y <= 7; y++) {
      const k = key(x, y);
      const px = x * CELL, py = y * CELL;
      const usedHere = usedSet.has(k) || masterUsedSet.has(k);

      let clickable = false, fill = "rgba(255,255,255,0.9)", stroke = "rgba(0,0,0,0.15)", r = 4;
      if (usedHere) { fill = "rgba(90,90,95,0.55)"; stroke = "rgba(90,90,95,0.7)"; }
      if (onPick && activePlayer && inRegion(activePlayer, x, y) && !usedHere) {
        clickable = true; fill = activePlayer.solid; stroke = "white"; r = 7;
      }

      const circle = svgEl("circle", { cx: px, cy: py, r, fill, stroke, "stroke-width": 1.5, class: "vertex" + (clickable ? " clickable" : "") });
      if (clickable) circle.addEventListener("click", () => onPick(x, y));
      svg.appendChild(circle);
    }
  }

  if (picks) {
    picks.forEach((pt, pid) => {
      if (!pt) return;
      const p = PLAYERS[pid];
      svg.appendChild(svgEl("circle", { cx: pt[0] * CELL, cy: pt[1] * CELL, r: 9, fill: p.solid, stroke: "white", "stroke-width": 2 }));
    });
  }
  if (masterVertex) {
    svg.appendChild(svgEl("circle", { cx: masterVertex[0] * CELL, cy: masterVertex[1] * CELL, r: 10, fill: "black", stroke: "white", "stroke-width": 2 }));
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
    usedMasterKeys: new Set(),
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
    players: room.slots.map((s) => (s ? { name: s.name, connected: s.connected, lobbyReady: s.lobbyReady } : null)),
    totals: room.totals.slice(),
    usedOwnKeys: room.usedOwnKeys.map((set) => [...set]),
    usedMasterKeys: [...room.usedMasterKeys],
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
}

function actionPick(participant, x, y) {
  if (room.phase !== "picking") return;
  const slot = room.slots.indexOf(participant);
  if (slot === -1 || room.lockedIn[slot]) return;
  const player = PLAYERS[slot];
  const inRegion = x >= player.qx[0] && x <= player.qx[1] && y >= player.qy[0] && y <= player.qy[1];
  if (!inRegion || room.usedOwnKeys[slot].has(key(x, y))) return;

  room.currentPicks[slot] = [x, y];
  room.lockedIn[slot] = true;
  if (room.lockedIn.every(Boolean)) room.phase = "revealReady";
  broadcastState();
}

function doReveal() {
  const master = room.masterSequence[room.round - 1];
  const picks = room.currentPicks;
  const scores = picks.map((pt, i) => {
    const others = [master, ...picks.filter((_, j) => j !== i)];
    return round6(Math.min(...others.map((o) => dist(pt, o))));
  });
  scores.forEach((s, i) => (room.totals[i] += s));
  room.usedMasterKeys.add(key(...master));
  room.history.push({ round: room.round, master, picks: picks.slice(), scores });
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
}

function dispatchAction(participant, msg) {
  switch (msg.t) {
    case "chooseSlot": return actionChooseSlot(participant, msg.slot);
    case "toggleReady": return actionToggleReady(participant);
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
  stage.appendChild(el("div", { class: "stage-sub", text: "One player hosts and shares a link or code; the other 3 join from their own devices on the same network." }));
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
      card.appendChild(el("div", { class: "lobby-slot-name", text: occ.name + (occ.connected ? "" : " (disconnected)") }));
      card.appendChild(el("div", { class: "lobby-slot-ready", text: occ.lobbyReady ? "Ready" : "Not ready" }));
    } else {
      card.appendChild(el("div", { class: "lobby-slot-name", text: "Open" }));
      if (v.mySlot != null && v.players[v.mySlot] && !v.players[v.mySlot].lobbyReady) {
        const moveBtn = el("button", { text: "Play as " + p.name, class: "secondary small" });
        moveBtn.addEventListener("click", () => sendAction({ t: "chooseSlot", slot: i }));
        card.appendChild(moveBtn);
      }
    }
    slotsWrap.appendChild(card);
  });
  stage.appendChild(slotsWrap);

  const readyCount = v.players.filter((p) => p && p.lobbyReady).length;
  const filledCount = v.players.filter(Boolean).length;
  stage.appendChild(el("div", { class: "stage-sub", text: `${filledCount}/4 joined • ${readyCount}/4 ready` }));

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

  const picksDisplay = [null, null, null, null];
  if (v.myPick) picksDisplay[v.mySlot] = v.myPick;

  stage.appendChild(buildBoard({
    mySlot: v.mySlot,
    usedOwnKeys: v.usedOwnKeys,
    usedMasterKeys: v.usedMasterKeys,
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
  table.appendChild(el("thead", {}, [el("tr", {}, [el("th", { text: "Player" }), el("th", { text: "Vertex" }), el("th", { text: "Score (min dist)" }), el("th", { text: "Total" })])]));
  const tbody = el("tbody");
  PLAYERS.forEach((p, i) => {
    tbody.appendChild(el("tr", {}, [
      el("td", {}, [playerPillNamed(p, v.players[i] ? v.players[i].name : p.name)]),
      el("td", { text: dispStr(h.picks[i][0], h.picks[i][1]) }),
      el("td", { text: h.scores[i].toFixed(3) }),
      el("td", { text: v.totals[i].toFixed(3) }),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  wrap.appendChild(el("div", { class: "stage-sub", text: `Master vertex: ${dispStr(h.master[0], h.master[1])}`, style: "margin-top:10px" }));
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
  master: "A master vertex (black) is drawn from the board's 49 interior corners and shown to everyone before they pick.",
  scoring: "Each player's score is their distance to the nearest of the other 4 points — sometimes another player, sometimes the master vertex.",
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
