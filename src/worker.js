// ===== Constants =====
const PHASES = {
  LOBBY: "lobby",
  VOTE: "vote",     // topic shown, everyone votes A/B secretly
  REVEAL: "reveal", // votes opened, minority drinks
};
const MAX_PLAYERS = 10;
const MIN_PLAYERS = 3;
const GRACE_MS = 15_000;
const VOTE_MS = 60_000;  // vote window; abstainers drink

// Two-choice topics. Generic nouns only — no brand/IP names.
// t = question label (defaults to どっち派？ client-side when omitted).
const TOPICS = [
  { a: "犬", b: "猫" },
  { a: "海", b: "山" },
  { a: "夏", b: "冬" },
  { a: "朝型", b: "夜型" },
  { a: "インドア", b: "アウトドア" },
  { a: "都会暮らし", b: "田舎暮らし" },
  { a: "ご飯", b: "パン" },
  { a: "肉", b: "魚" },
  { a: "うどん", b: "そば" },
  { a: "つぶあん", b: "こしあん" },
  { a: "映画は字幕", b: "映画は吹き替え" },
  { a: "シャワーだけ", b: "湯船必須" },
  { a: "旅行は計画派", b: "行き当たりばったり" },
  { a: "甘党", b: "辛党" },
  { a: "固めプリン", b: "とろけるプリン" },
  { a: "目玉焼きに醤油", b: "目玉焼きにソース" },
  { a: "焼き鳥はタレ", b: "焼き鳥は塩" },
  { a: "焼き餃子", b: "水餃子" },
  { a: "卵焼きは甘い", b: "卵焼きはしょっぱい" },
  { a: "朝ごはん食べる", b: "朝は食べない" },
  { a: "電話派", b: "テキスト派" },
  { a: "映画は映画館", b: "映画は家" },
  { a: "並んででも人気店", b: "並ばず空いてる店" },
  { a: "夏祭り", b: "クリスマス" },
  { a: "傘を持ち歩く", b: "降ったら買う" },
  { a: "目覚まし一発", b: "スヌーズ常習" },
  { a: "部屋はきれい", b: "部屋は散らかり気味" },
  { a: "30分前行動", b: "ギリギリ到着" },
  { a: "服は毎回違うの", b: "同じ服を着回す" },
  { t: "飲みの場では？", a: "ビール", b: "ハイボール" },
  { t: "飲みの場では？", a: "日本酒", b: "焼酎" },
  { t: "飲みの場では？", a: "赤ワイン", b: "白ワイン" },
  { t: "飲みの場では？", a: "締めのラーメン", b: "締めのスイーツ" },
  { t: "飲みの場では？", a: "一次会で帰る", b: "朝まで飲む" },
  { t: "飲みの場では？", a: "カラオケで歌いたい", b: "聞いていたい" },
  { t: "飲みの場では？", a: "鍋奉行やりたい", b: "全部任せたい" },
  { t: "飲みの場では？", a: "大人数でワイワイ", b: "サシでしっぽり" },
  { t: "飲みの場では？", a: "飲み放題", b: "単品注文" },
  { t: "究極の選択！", a: "一生カレー", b: "一生ラーメン" },
  { t: "究極の選択！", a: "過去に戻れる", b: "未来に行ける" },
  { t: "究極の選択！", a: "透明人間になれる", b: "空を飛べる" },
  { t: "究極の選択！", a: "お金持ちで多忙", b: "そこそこで自由" },
  { t: "究極の選択！", a: "記憶力2倍", b: "集中力2倍" },
  { t: "究極の選択！", a: "満員電車で1時間", b: "徒歩で2時間" },
  { t: "究極の選択！", a: "暑すぎる夏", b: "寒すぎる冬" },
  { t: "究極の選択！", a: "歌がうまくなる", b: "絵がうまくなる" },
  { t: "究極の選択！", a: "1ヶ月スマホなし", b: "1ヶ月お菓子なし" },
  { t: "究極の選択！", a: "食べ放題で元を取る", b: "好きな物だけ少し" },
  { t: "究極の選択！", a: "宝くじ当選を公表", b: "絶対秘密にする" },
  { t: "恋愛なら？", a: "追いかけたい", b: "追いかけられたい" },
  { t: "恋愛なら？", a: "連絡はマメに", b: "連絡はほどほど" },
  { t: "恋愛なら？", a: "年上がいい", b: "年下がいい" },
  { t: "恋愛なら？", a: "面白い人", b: "優しい人" },
  { t: "遊園地では？", a: "絶叫マシン直行", b: "絶叫系は無理" },
  { t: "遊園地では？", a: "お化け屋敷平気", b: "ホラー無理" },
  { t: "メッセージは？", a: "即返信", b: "あとでまとめて" },
];

// ===== Worker entry =====
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const room = (url.searchParams.get("room") || "").toUpperCase();
      if (!/^[A-Z0-9]{4,6}$/.test(room)) {
        return new Response("Invalid room code", { status: 400 });
      }
      const id = env.ROOMS.idFromName(room);
      return env.ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ===== GameRoom Durable Object =====
export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.sessions = new Map();
    this.players = new Map(); // playerId -> { name, drinkCount, removeTimer, vote }
    this.phase = PHASES.LOBBY;
    this.hostId = null;
    this.round = 0;
    this.topic = null;        // { t, a, b }
    this.voteDeadline = null; // epoch ms
    this.lastTopicIdx = -1;
    this.timers = [];
    this.lastResult = null;
  }

  async fetch(request) {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "").trim().slice(0, 20);
    const clientId = (url.searchParams.get("clientId") || "").trim();
    if (!name) return new Response("Missing name", { status: 400 });
    if (!/^[A-Za-z0-9-]{8,64}$/.test(clientId)) {
      return new Response("Missing or invalid clientId", { status: 400 });
    }

    const existing = this.players.get(clientId);

    let rejectCode = 0;
    let rejectReason = "";
    if (!existing) {
      if (this.players.size >= MAX_PLAYERS) {
        rejectCode = 4030; rejectReason = "Room full";
      } else if (this.phase === PHASES.VOTE) {
        // New players can join in LOBBY and between rounds (REVEAL).
        rejectCode = 4023; rejectReason = "Round in progress";
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    if (rejectCode) {
      try { server.close(rejectCode, rejectReason); } catch {}
      return new Response(null, { status: 101, webSocket: client });
    }

    if (existing) {
      if (existing.removeTimer) {
        clearTimeout(existing.removeTimer);
        existing.removeTimer = null;
      }
      existing.name = name;
    } else {
      this.players.set(clientId, {
        name,
        drinkCount: 0,
        removeTimer: null,
        vote: null,
      });
      if (!this.hostId) this.hostId = clientId;
    }

    const prior = existing ? this.sessions.get(clientId) : null;
    this.sessions.set(clientId, { ws: server, playerId: clientId });

    server.addEventListener("message", async (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      await this.handleMessage(clientId, msg);
    });
    const onClose = () => {
      const sess = this.sessions.get(clientId);
      if (sess && sess.ws === server) this.handleDisconnect(clientId);
    };
    server.addEventListener("close", onClose);
    server.addEventListener("error", onClose);

    if (prior) {
      try { prior.ws.close(4002, "Replaced by new connection"); } catch {}
    }

    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleMessage(playerId, msg) {
    switch (msg.type) {
      case "ping": {
        const sess = this.sessions.get(playerId);
        if (sess) {
          try { sess.ws.send(JSON.stringify({ type: "pong" })); } catch {}
        }
        break;
      }
      case "hello": {
        const sess = this.sessions.get(playerId);
        if (sess) {
          try { sess.ws.send(JSON.stringify(this.viewForPlayer(playerId))); } catch {}
        }
        break;
      }
      case "start":
        if (playerId === this.hostId
            && (this.phase === PHASES.LOBBY || this.phase === PHASES.REVEAL)) {
          if (this.players.size < MIN_PLAYERS) return;
          this.startRound(msg.custom);
        }
        break;
      case "vote": {
        if (this.phase !== PHASES.VOTE) return;
        const p = this.players.get(playerId);
        if (!p || p.vote) return; // first vote only, no take-backs
        if (msg.choice !== "a" && msg.choice !== "b") return;
        p.vote = { choice: msg.choice };
        if (this.allVoted()) {
          this.resolveRound();
        } else {
          this.broadcast();
        }
        break;
      }
    }
  }

  handleDisconnect(clientId) {
    this.sessions.delete(clientId);
    const player = this.players.get(clientId);
    if (!player) return;

    if (this.phase === PHASES.LOBBY) {
      this.removePlayer(clientId);
      this.broadcast();
      return;
    }

    if (player.removeTimer) clearTimeout(player.removeTimer);
    player.removeTimer = setTimeout(() => {
      player.removeTimer = null;
      if (this.sessions.has(clientId)) return; // reconnected during grace
      this.removePlayerFromGame(clientId);
    }, GRACE_MS);
    this.broadcast();
  }

  removePlayerFromGame(clientId) {
    this.removePlayer(clientId);
    if (this.players.size < MIN_PLAYERS) {
      this.resetToLobby();
      return;
    }
    if (this.phase === PHASES.VOTE && this.allVoted()) {
      this.resolveRound();
      return;
    }
    this.broadcast();
  }

  removePlayer(clientId) {
    this.players.delete(clientId);
    if (this.hostId === clientId) {
      this.hostId = this.players.keys().next().value || null;
    }
  }

  allVoted() {
    for (const p of this.players.values()) {
      if (!p.vote) return false;
    }
    return this.players.size > 0;
  }

  pickTopic(custom) {
    // Host-supplied custom topic wins if both options are present.
    if (custom && typeof custom === "object") {
      const a = String(custom.a || "").trim().slice(0, 24);
      const b = String(custom.b || "").trim().slice(0, 24);
      const t = String(custom.t || "").trim().slice(0, 40);
      if (a && b) return { t: t || "どっち派？", a, b };
    }
    let idx;
    do {
      idx = Math.floor(Math.random() * TOPICS.length);
    } while (idx === this.lastTopicIdx && TOPICS.length > 1);
    this.lastTopicIdx = idx;
    const topic = TOPICS[idx];
    return { t: topic.t || "どっち派？", a: topic.a, b: topic.b };
  }

  startRound(custom) {
    this.clearTimers();
    this.phase = PHASES.VOTE;
    this.round += 1;
    this.topic = this.pickTopic(custom);
    this.voteDeadline = Date.now() + VOTE_MS;
    this.lastResult = null;
    for (const p of this.players.values()) p.vote = null;
    this.timers.push(setTimeout(() => {
      if (this.phase === PHASES.VOTE) this.resolveRound();
    }, VOTE_MS));
    this.broadcast();
  }

  resolveRound() {
    this.clearTimers();

    // Anyone with no vote by now ran out the clock.
    for (const p of this.players.values()) {
      if (!p.vote) p.vote = { abstain: true };
    }

    const aIds = [], bIds = [], abstainIds = [];
    for (const [id, p] of this.players) {
      if (p.vote.abstain) abstainIds.push(id);
      else if (p.vote.choice === "a") aIds.push(id);
      else bIds.push(id);
    }

    // Minority side drinks 1 each. Tie → draw. One side empty → unanimous,
    // nobody drinks (an empty side is not a "minority"). Abstainers always
    // drink 1. Fixed penalties only — no escalation.
    let outcome;
    const losers = new Set(abstainIds);
    if (aIds.length === 0 && bIds.length === 0) {
      outcome = "draw";
    } else if (aIds.length === 0 || bIds.length === 0) {
      outcome = "unanimous";
    } else if (aIds.length === bIds.length) {
      outcome = "draw";
    } else if (aIds.length < bIds.length) {
      outcome = "a";
      for (const id of aIds) losers.add(id);
    } else {
      outcome = "b";
      for (const id of bIds) losers.add(id);
    }
    for (const id of losers) {
      const p = this.players.get(id);
      if (p) p.drinkCount += 1;
    }

    this.phase = PHASES.REVEAL;
    this.voteDeadline = null;
    this.lastResult = {
      round: this.round,
      topic: this.topic,
      outcome,                 // "a" | "b" = that side was the minority
      a: aIds,
      b: bIds,
      abstain: abstainIds,
      losers: [...losers],
    };
    this.broadcast();
  }

  resetToLobby() {
    this.clearTimers();
    this.phase = PHASES.LOBBY;
    this.topic = null;
    this.voteDeadline = null;
    this.lastResult = null;
    for (const p of this.players.values()) p.vote = null;
    this.broadcast();
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  broadcast() {
    for (const [, session] of this.sessions) {
      try {
        session.ws.send(JSON.stringify(this.viewForPlayer(session.playerId)));
      } catch {}
    }
  }

  viewForPlayer(playerId) {
    const players = [...this.players.entries()].map(([id, p]) => ({
      id,
      name: p.name,
      drinkCount: p.drinkCount,
      isYou: id === playerId,
      // Votes stay secret until REVEAL — only the fact that they voted leaks.
      voted: !!p.vote,
      connected: this.sessions.has(id),
    }));
    const me = this.players.get(playerId);
    return {
      type: "state",
      state: {
        phase: this.phase,
        players,
        hostId: this.hostId,
        you: playerId,
        round: this.round,
        topic: this.phase === PHASES.LOBBY ? null : this.topic,
        voteDeadline: this.phase === PHASES.VOTE ? this.voteDeadline : null,
        myVote: (me && me.vote && me.vote.choice) || null,
        result: this.phase === PHASES.REVEAL ? this.lastResult : null,
      },
    };
  }
}
