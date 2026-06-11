// Smoke test: 4 players.
// Round 1 = 2-2 tie (draw, nobody drinks) + vote secrecy check.
// Round 2 = custom topic, 3-1 split (minority drinks).
// Round 3 = unanimous (nobody drinks).
// Usage: node test-flow.mjs [port]
const PORT = process.argv[2] || "8790";
const ROOM = "TEST1";

function client(name, id) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${ROOM}&name=${name}&clientId=${id}`);
  const c = { name, id, ws, state: null };
  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "hello" })));
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "state") c.state = msg.state;
  });
  ws.addEventListener("close", (e) => console.log(`[${name}] closed ${e.code} ${e.reason}`));
  return c;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, desc, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (fn()) return;
    await sleep(50);
  }
  throw new Error("timeout waiting for: " + desc);
}

const a = client("Alice", "aaaaaaaa-test-0001");
const b = client("Bob", "bbbbbbbb-test-0002");
const c = client("Carol", "cccccccc-test-0003");
const d = client("Dave", "dddddddd-test-0004");
const all = [a, b, c, d];

await waitFor(() => all.every(x => x.state && x.state.players.length === 4), "all in lobby");
console.log("LOBBY OK — host:", a.state.hostId);
const host = all.find(x => x.state.you === x.state.hostId);

// ===== Round 1: 2-2 draw =====
host.ws.send(JSON.stringify({ type: "start" }));
await waitFor(() => all.every(x => x.state.phase === "vote" && x.state.topic), "vote phase 1");
console.log("VOTE OK — topic:", JSON.stringify(a.state.topic), "deadline:", a.state.voteDeadline);
if (!a.state.voteDeadline) throw new Error("voteDeadline should be set during vote");

a.ws.send(JSON.stringify({ type: "vote", choice: "a" }));
await waitFor(() => b.state.players.find(p => p.id === a.id)?.voted, "Alice voted flag visible");
// Secrecy: Bob must see THAT Alice voted, but not WHAT.
const aliceFromBob = b.state.players.find(p => p.id === a.id);
if ("choice" in aliceFromBob || "vote" in aliceFromBob) throw new Error("vote choice leaked during VOTE phase");
if (b.state.myVote !== null) throw new Error("Bob should have no myVote yet");
console.log("SECRECY OK — voted flag visible, choice hidden");

b.ws.send(JSON.stringify({ type: "vote", choice: "a" }));
c.ws.send(JSON.stringify({ type: "vote", choice: "b" }));
d.ws.send(JSON.stringify({ type: "vote", choice: "b" }));

await waitFor(() => all.every(x => x.state.phase === "reveal" && x.state.result), "reveal 1");
const r1 = a.state.result;
console.log("RESULT 1:", r1.outcome, "a:", r1.a.length, "b:", r1.b.length, "losers:", r1.losers.length);
if (r1.outcome !== "draw") throw new Error("2-2 should be a draw");
if (r1.losers.length !== 0) throw new Error("draw should have no losers");
if (a.state.players.some(p => p.drinkCount !== 0)) throw new Error("nobody should drink on a draw");
console.log("ROUND 1 OK — draw, no drinks");

// ===== Round 2: custom topic, 3-1 split =====
host.ws.send(JSON.stringify({ type: "start", custom: { t: "テスト質問？", a: "左", b: "右" } }));
await waitFor(() => all.every(x => x.state.phase === "vote" && x.state.round === 2), "vote phase 2");
if (a.state.topic.t !== "テスト質問？" || a.state.topic.a !== "左" || a.state.topic.b !== "右") {
  throw new Error("custom topic not applied: " + JSON.stringify(a.state.topic));
}
console.log("CUSTOM TOPIC OK:", JSON.stringify(a.state.topic));

a.ws.send(JSON.stringify({ type: "vote", choice: "a" }));
b.ws.send(JSON.stringify({ type: "vote", choice: "a" }));
c.ws.send(JSON.stringify({ type: "vote", choice: "a" }));
d.ws.send(JSON.stringify({ type: "vote", choice: "b" }));

await waitFor(() => all.every(x => x.state.phase === "reveal" && x.state.result.round === 2), "reveal 2");
const r2 = a.state.result;
console.log("RESULT 2:", r2.outcome, "losers:", r2.losers);
if (r2.outcome !== "b") throw new Error("side B (1 voter) should be the minority");
if (r2.losers.length !== 1 || r2.losers[0] !== d.id) throw new Error("Dave should be the sole loser");
const daveP = a.state.players.find(p => p.id === d.id);
if (daveP.drinkCount !== 1) throw new Error("Dave should have 1 drink");
console.log("ROUND 2 OK — minority drinks");

// ===== Round 3: unanimous =====
host.ws.send(JSON.stringify({ type: "start" }));
await waitFor(() => all.every(x => x.state.phase === "vote" && x.state.round === 3), "vote phase 3");
for (const x of all) x.ws.send(JSON.stringify({ type: "vote", choice: "a" }));

await waitFor(() => all.every(x => x.state.phase === "reveal" && x.state.result.round === 3), "reveal 3");
const r3 = a.state.result;
console.log("RESULT 3:", r3.outcome, "losers:", r3.losers.length);
if (r3.outcome !== "unanimous") throw new Error("all-same vote should be unanimous");
if (r3.losers.length !== 0) throw new Error("unanimous should have no losers");
const daveP3 = a.state.players.find(p => p.id === d.id);
if (daveP3.drinkCount !== 1) throw new Error("drink counts should persist across rounds");
console.log("ROUND 3 OK — unanimous, no drinks");

console.log("\nALL TESTS PASSED");
for (const x of all) x.ws.close(1000);
process.exit(0);
