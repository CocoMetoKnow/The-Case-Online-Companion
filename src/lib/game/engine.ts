// @ts-nocheck
import { EVENT_DEFS, EVENT_MIN_PLAYERS, MIN_CATEGORY_CARDS, UNDERGROUND_PASSAGES, cardsByCategory, eventsForPlayers } from "./cards";
import { START_HALL, isQuestionRoom, roomById } from "./board";
import { PLAYER_COLORS, type GameState, type PiecePos, type Secrets } from "./types";
import { uid } from "../utils";

export function fisherYates(arr, rand = Math.random) {
	const a = arr.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}
export function makeCode() {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let s = "gmm";
	for (let i = 0; i < 5; i++) s += alphabet[Math.floor(Math.random() * 32)];
	return s;
}
/** Room codes ignore case and a pasted share link, so a phone keyboard cannot miss the host. */
export function roomCode(raw) {
	const body = (raw.match(/[?&]code=([A-Za-z0-9_-]+)/i)?.[1] ?? raw).replace(/[^a-zA-Z0-9_-]/g, "").replace(/^gmm/i, "").toUpperCase().slice(0, 12);
	return body.length >= 4 ? `gmm${body}` : "";
}
function emptySecrets() {
	return {
		solution: {},
		hands: {}
	};
}
function seatName(name, fallback) {
	const trimmed = String(name ?? "").trim();
	if (!trimmed || /^detective$/i.test(trimmed)) return fallback;
	return trimmed.slice(0, 24);
}
export function createLobby(hostName, settings, cards, code = makeCode()): { state: GameState; secrets: Secrets } {
	const hostId = uid("p");
	return {
		state: {
			version: 1,
			code,
			hostId,
			settings,
			cards,
			leftover: [],
			players: [{
				id: hostId,
				name: seatName(hostName, "Host"),
				color: PLAYER_COLORS[0],
				seat: 0,
				eliminated: false,
				isHost: true,
				position: {
					kind: "hall" as const,
					...START_HALL[0]
				}
			}],
			turnOrder: [hostId],
			turnIndex: 0,
			phase: "lobby",
			dice: null,
			moveBudget: 0,
			actionsLeft: 0,
			freeQuestion: false,
			whisperMode: false,
			question: null,
			event: null,
			log: [],
			winnerId: null,
			startedAt: null,
			eventDeck: fisherYates(eventsForPlayers(1, settings)),
			eventDiscard: [],
			accusation: null,
			passages: [],
			skipIds: [],
			notesLock: {},
			influences: [],
			wait: null,
			naming: null
		},
		secrets: emptySecrets()
	};
}
export function addPlayer(state: GameState, name: string, id = uid("p")): GameState {
	if (state.startedAt) return state;
	if (state.settings.locked) return state;
	if (state.players.length >= state.settings.maxPlayers) return state;
	if (state.players.some((p) => p.id === id)) return state;
	const seat = state.players.length;
	const player = {
		id,
		name: seatName(name, `Guest ${seat + 1}`),
		color: PLAYER_COLORS[seat % PLAYER_COLORS.length],
		seat,
		eliminated: false,
		isHost: false,
		position: {
			kind: "hall" as const,
			...START_HALL[seat % START_HALL.length]
		}
	};
	return {
		...state,
		players: [...state.players, player],
		turnOrder: [...state.turnOrder, id]
	};
}
export function removePlayer(state: GameState, playerId: string): GameState {
	if (state.startedAt) return state;
	if (playerId === state.hostId) return state;
	return {
		...state,
		players: state.players.filter((p) => p.id !== playerId),
		turnOrder: state.turnOrder.filter((id) => id !== playerId)
	};
}
export function renamePlayer(state: GameState, playerId: string, name: string): GameState {
	return {
		...state,
		players: state.players.map((p) => p.id === playerId ? {
			...p,
			name: name.trim() || p.name
		} : p)
	};
}
function log(state, text) {
	return {
		...state,
		log: [...state.log.slice(-8), {
			id: uid("log"),
			text,
			turn: state.turnIndex
		}]
	};
}
var CLASSIC_PASSAGES = [{
	a: "study",
	b: "ballroom"
}, {
	a: "library",
	b: "kitchen"
}];
function makePassages(roomIds) {
	const set = new Set(roomIds.filter((id) => id && id !== "foyer"));
	const underground = UNDERGROUND_PASSAGES.filter((p) => set.has(p.a) && set.has(p.b));
	if (underground.length) return underground;
	const classic = CLASSIC_PASSAGES.filter((p) => set.has(p.a) && set.has(p.b));
	if (classic.length >= 2) return classic;
	const used = new Set(classic.flatMap((p) => [p.a, p.b]));
	const pool = fisherYates([...set].filter((id) => !used.has(id)));
	const extra = [];
	while (extra.length + classic.length < 2 && pool.length >= 2) {
		const a = pool.shift();
		const b = pool.shift();
		if (a && b) extra.push({
			a,
			b
		});
	}
	return [...classic, ...extra];
}
export function dealAndStart(state: GameState, secrets: Secrets): { state: GameState; secrets: Secrets } {
	if (state.players.length < 2) return {
		state,
		secrets
	};
	const players = state.players.map((p, i) => ({
		...p,
		seat: i,
		eliminated: false,
		position: {
			kind: "hall" as const,
			...START_HALL[i % START_HALL.length]
		}
	}));
	const order = fisherYates(players.map((p) => p.id));
	const passages = makePassages(state.settings.enabledRoomIds);
	const eventDeck = fisherYates(eventsForPlayers(players.length, state.settings));
	const started = {
		...state,
		players,
		turnOrder: order,
		turnIndex: 0,
		leftover: [],
		phase: "roll",
		dice: null,
		moveBudget: 0,
		actionsLeft: 0,
		freeQuestion: true,
		whisperMode: false,
		question: null,
		event: null,
		winnerId: null,
		startedAt: Date.now(),
		accusation: null,
		eventDeck,
		eventDiscard: [],
		passages,
		skipIds: [],
		notesLock: {},
		influences: [],
		wait: null,
		naming: null,
		log: [],
		spy: null,
		hush: null,
		sync: null,
		shortDieId: null,
		pace: null,
		singleDie: false,
		notice: null,
		noticeSelf: null,
		noticeFor: null,
		privateShow: null
	};
	const split = splitEven(started, { solution: {}, hands: {} });
	const nameOf = (id) => state.cards.find((c) => c.id === id)?.name ?? roomById(id)?.name ?? id;
	const passageText = passages.map((p) => `${nameOf(p.a)} ↔ ${nameOf(p.b)}`).join("; ");
	const speak = Boolean(state.settings?.speakMode);
	const spokenNote = speak ? " Suggestions are spoken out loud." : "";
	const opening = `Play order is fixed for this game: ${order.map((id) => players.find((p) => p.id === id)?.name ?? "Guest").join(" → ")}. ${currentName(split.state)} begins.${spokenNote} Passages: ${passageText || "none"}.`;
	const dealt = {
		state: log(split.state, opening),
		secrets: split.secrets
	};
	return { state: dealt.state, secrets: rememberRound(dealt.state, dealt.secrets) };
}
export function currentPlayer(state: GameState) {
	const id = state.turnOrder[state.turnIndex % state.turnOrder.length];
	return state.players.find((p) => p.id === id);
}
export function currentName(state) {
	return currentPlayer(state)?.name ?? "A guest";
}
export function turnActorId(state: GameState): string | undefined {
	const cur = currentPlayer(state);
	if (!cur) return void 0;
	const guide = (state.influences ?? []).find((i) => i.victimId === cur.id);
	if (guide && guide.controllerId !== cur.id) return guide.controllerId;
	return cur.id;
}
/** Who the table is actually waiting on. A quiet phone that is not in this list must not freeze the others. */
export function blockingPlayerIds(state: GameState): string[] {
	if (!state?.startedAt || state.phase === "lobby" || state.phase === "gameover") return [];
	const ids = new Set<string>();
	const add = (id?: string | null) => {
		if (id) ids.add(String(id));
	};
	const ev = state.event;
	if (state.phase === "event" && ev) {
		if (ev.step === "reveal" || ev.step === "ack" || ev.step === "show-all") {
			const key = ev.step === "ack" ? "acked" : "seen";
			const seen = new Set(Array.isArray(ev.data?.[key]) ? (ev.data[key] as string[]).map(String) : []);
			for (const player of state.players) if (!player.eliminated && !seen.has(player.id)) add(player.id);
			return [...ids];
		}
		if (ev.data?.waitingId) add(String(ev.data.waitingId));
		else if (ev.step === "show-private") add(ev.data?.viewerId ? String(ev.data.viewerId) : null);
		else add(turnActorId(state));
		return [...ids];
	}
	const q = state.question;
	if (state.phase === "question" && q) {
		if (q.missId) return [];
		if (q.shownCardId && !q.resolved) {
			add(q.askerId);
			const guide = (state.influences ?? []).find((item) => item.victimId === q.askerId);
			if (guide) add(guide.controllerId);
			return [...ids];
		}
		if (q.showerId && !q.shownCardId) {
			add(q.showerId);
			return [...ids];
		}
		if (q.spoken && q.askingId) {
			add(q.askingId);
			return [...ids];
		}
	}
	add(turnActorId(state));
	return [...ids];
}
function subjectOf(state, actorId) {
	if (turnActorId(state) !== actorId) return null;
	return currentPlayer(state)?.id ?? null;
}
function canAct(state, playerId) {
	if (state.phase === "gameover" || state.phase === "lobby") return false;
	if (turnActorId(state) !== playerId) return false;
	const cur = currentPlayer(state);
	if (!cur) return false;
	if (cur.eliminated && state.phase !== "question") return false;
	return true;
}
/** The magnifying glass (a 3 on the first die) counts as 0. */
export function movementTotal(dice: [number, number] | null | undefined): number | null {
	if (!dice) return null;
	return (dice[0] === 3 ? 0 : dice[0]) + dice[1];
}
export function rollDice(state: GameState, playerId: string): { state: GameState; snakeEyes: boolean } {
	if (state.phase !== "roll" && !(state.phase === "event" && state.event?.kind === "extra-roll")) return {
		state,
		snakeEyes: false
	};
	if (!canAct(state, playerId) && state.event?.kind !== "extra-roll") return {
		state,
		snakeEyes: false
	};
	const actor = currentPlayer(state);
	if (actor && state.shortDieId === actor.id) {
		const d = 1 + Math.floor(Math.random() * 6);
		const again = state.event?.kind === "extra-roll";
		const board = state.settings?.table === "board";
		const next = log({
			...state,
			dice: [d, d],
			singleDie: true,
			shortDieId: null,
			pace: d,
			moveBudget: d,
			naming: null,
			phase: board ? "move" : "action",
			actionsLeft: 1,
			event: again ? null : state.event
		}, `${actor.name} rolls. Move ${d}.`);
		return { state: next, snakeEyes: false };
	}
	const d1 = 1 + Math.floor(Math.random() * 6);
	const d2 = 1 + Math.floor(Math.random() * 6);
	const glass = d1 === 3;
	const snakeEyes = d1 === 1 && d2 === 1;
	const total = (glass ? 0 : d1) + d2;
	let next = {
		...state,
		dice: [d1, d2],
		singleDie: false,
		moveBudget: snakeEyes ? 0 : total,
		naming: null
	};
	const again = state.event?.kind === "extra-roll";
	const board = state.settings?.table === "board";
	if (snakeEyes || glass) {
		const line = `${currentName(state)} rolls. Move ${total}.`;
		next = log(drawEvent(again ? { ...next, event: null } : next), line);
		return {
			state: next,
			snakeEyes: true
		};
	}
	const shown = `Move ${total}.`;
	if (board) {
		next = log({
			...next,
			phase: "move",
			moveBudget: total,
			actionsLeft: 1,
			event: again ? null : next.event
		}, `${currentName(state)} rolls. ${shown}`);
		return {
			state: next,
			snakeEyes: false
		};
	}
	next = log({
		...next,
		phase: "action",
		actionsLeft: 1,
		event: again ? null : next.event
	}, `${currentName(state)} rolls. ${shown}`);
	return {
		state: next,
		snakeEyes: false
	};
}
export function declareSnakeEyes(state: GameState, playerId: string): GameState {
	if (state.phase !== "action") return state;
	if (!canAct(state, playerId)) return state;
	return log(drawEvent({
		...state,
		dice: [1, 1]
	}), `${currentName(state)} rolled snake eyes. Follow the card at the table.`);
}
export function drawEvent(state) {
	if (state.phase === "event" && state.event) return state;
	// Sabotage disables exactly the next power-up card its target would draw.
	// Intercept here, before the deck is touched, so the card they would have
	// drawn stays in the deck for later — sabotage just cancels the draw.
	const drawer = currentPlayer(state);
	if (state.sabotage?.targetId && drawer && state.sabotage.targetId === drawer.id) {
		const saboteur = state.players.find((p) => p.id === state.sabotage?.byId);
		return {
			...state,
			sabotage: null,
			phase: "event",
			event: {
				deckId: uid("ev"),
				kind: "sabotage-block",
				title: "Sabotaged",
				description: `${saboteur?.name ?? "Someone"} sabotaged this power-up before it could take effect.`,
				step: "reveal",
				data: { lockedKind: "sabotage-block" }
			}
		};
	}
	let deck = state.eventDeck?.slice() ?? [];
	let discard = state.eventDiscard?.slice() ?? [];
	const living = state.players.filter((p) => !p.eliminated).length;
	const legal = (kind) => (EVENT_MIN_PLAYERS[kind] ?? 2) <= living;
	if (!deck.length && !discard.some(legal)) {
		deck = fisherYates(eventsForPlayers(living, state.settings));
	}
	let kind = null;
	while (kind == null) {
		if (!deck.length) {
			const recycled = discard.filter(legal);
			discard = discard.filter((k) => !legal(k));
			if (!recycled.length) break;
			deck = fisherYates(recycled);
		}
		const next = deck[0];
		deck = deck.slice(1);
		if (!next) break;
		const def = EVENT_DEFS.find((e) => e.kind === next);
		if (!def || !legal(next)) {
			discard = [...discard, next];
			continue;
		}
		kind = next;
		const event = {
			deckId: uid("ev"),
			kind: def.kind,
			title: def.title,
			description: def.description,
			step: "reveal",
			data: { lockedKind: def.kind }
		};
		return {
			...state,
			eventDeck: deck,
			eventDiscard: [...discard, kind],
			event,
			phase: "event"
		};
	}
	return {
		...state,
		eventDeck: deck,
		eventDiscard: discard,
		phase: "action",
		event: null
	};
}
/** Tell the table what to do on the physical board, then carry on with the turn. */
export function holdForBoard(state, note, thenMode) {
	if (state.settings?.table === "board") {
		if (thenMode === "resume") return {
			...state,
			phase: "action",
			event: null,
			moveBudget: 0,
			actionsLeft: 1
		};
		const ready = {
			...state,
			phase: "action",
			event: null,
			moveBudget: 0,
			actionsLeft: 0
		};
		const actor = turnActorId(ready);
		return actor ? endTurn(ready, actor) : ready;
	}
	if (!state.event) return state;
	// The card was already explained once. Show what happened as a one line
	// notice and get on with the turn. Nobody has to confirm the physical board.
	return {
		...state,
		phase: "action",
		event: null,
		moveBudget: 0,
		actionsLeft: 1,
		notice: note,
		noticeSelf: null,
		noticeFor: null
	};
}
export function applyMove(state: GameState, playerId: string, dest: PiecePos): GameState {
	if (state.phase !== "move" && !(state.phase === "event" && state.event?.kind === "move-anywhere")) return state;
	const subject = subjectOf(state, playerId);
	if (!subject) return state;
	const player = state.players.find((p) => p.id === subject);
	if (!player) return state;
	if (state.phase === "event" && state.event?.kind === "move-anywhere") {
		if (dest.kind !== "room") return state;
		if (!(dest.roomId === "foyer" || state.settings.enabledRoomIds.includes(dest.roomId))) return state;
		const moved = placePlayer(state, subject, dest);
		const roomName = roomById(dest.roomId)?.name ?? dest.roomId;
		const noted = log({
			...moved,
			moveBudget: 0,
			actionsLeft: 1
		}, `${player.name} takes a hidden passage into the ${roomName}.`);
		return holdForBoard(noted, `On the physical board, move ${player.name}'s piece into the ${roomName}.`, "resume");
	}
	const blocked = blockedHallsFor(state.players, subject);
	const { nodes } = reachable(player.position, state.moveBudget, state.settings.enabledRoomIds, state.passages ?? [], blocked);
	const key = dest.kind === "hall" ? `h:${dest.x},${dest.y}` : `r:${dest.roomId}`;
	const node = nodes.get(key);
	if (!node || node.dist < 1) return state;
	const step = node.dist === 1 ? dest : reconstructPath(nodes, dest)[1];
	if (!step) return state;
	const stepNode = nodes.get(posKey(step));
	if (!stepNode || stepNode.dist !== 1) return state;
	const moved = placePlayer(state, subject, step);
	const left = state.moveBudget - 1;
	const fromRoom = player.position.kind === "room" ? player.position.roomId : null;
	const toRoom = step.kind === "room" ? step.roomId : null;
	const entered = toRoom != null;
	if (!entered && left > 0) return {
		...moved,
		moveBudget: left
	};
	const roomLabel = toRoom ? roomById(toRoom)?.name ?? toRoom : "";
	const text = fromRoom && toRoom && fromRoom !== toRoom ? `${player.name} takes the passage into the ${roomLabel}.` : entered ? `${player.name} steps into the ${roomLabel}.` : `${player.name} stops in the corridor.`;
	return log({
		...moved,
		phase: "action",
		moveBudget: 0
	}, text);
}
export function placePlayer(state, playerId, dest) {
	return {
		...state,
		players: state.players.map((p) => p.id === playerId ? {
			...p,
			position: dest
		} : p)
	};
}
export function skipMove(state: GameState, playerId: string): GameState {
	if (state.phase !== "move") return state;
	if (!canAct(state, playerId)) return state;
	return log({
		...state,
		phase: "action",
		moveBudget: 0
	}, `${currentName(state)} stays put.`);
}
export function canAsk(state: GameState, playerId: string): boolean {
	if (state.phase !== "action") return false;
	if (state.question?.offerAccusation) return false;
	if ((state.actionsLeft ?? 1) <= 0) return false;
	const subject = subjectOf(state, playerId);
	if (!subject) return false;
	const p = state.players.find((x) => x.id === subject);
	if (!p || p.eliminated) return false;
	// Speak mode plays on the real board. The player says they are in a room and that is enough.
	if (state.settings?.speakMode) return true;
	if (state.settings?.table === "board") {
		if (state.freeQuestion) return true;
		return isQuestionRoom(p.position, state.settings.enabledRoomIds);
	}
	if (state.settings.playMode === "online" || state.freeQuestion) return true;
	return isQuestionRoom(p.position, state.settings.enabledRoomIds);
}
export function beginQuestion(state: GameState, playerId: string, pick, secrets: Secrets): GameState {
	if (state.settings?.speakMode) return beginSpokenQuestion(state, playerId);
	if (!canAsk(state, playerId)) return state;
	const subject = subjectOf(state, playerId);
	if (!subject) return state;
	const asker = state.players.find((p) => p.id === subject);
	if (!asker) return state;
	const announced = pick.roomId;
	const ids = [
		pick.suspectId,
		pick.roomId,
		pick.weaponId,
		pick.timeId
	].filter(Boolean);
	if (!pick.roomId) return state;
	if (state.whisperMode && ids.length > 3) return state;
	const hush = state.hush;
	const hit = Boolean(hush && hush.byId !== subject && ids.map(String).includes(hush.cardId));
	const silencedId = hit ? hush?.cardId ?? null : null;
	const order = rotateAfter(state.turnOrder, subject).filter((id) => {
		const seated = state.players.find((p) => p.id === id);
		return Boolean(seated && !seated.eliminated && seated.id !== subject);
	});
	for (const seated of state.players) {
		if (seated.eliminated || seated.id === subject || order.includes(seated.id)) continue;
		order.push(seated.id);
	}
	const next = {
		...state,
		hush: hit ? null : hush ?? null,
		phase: "question",
		actionsLeft: 0,
		freeQuestion: false,
		whisperMode: false,
		naming: null,
		notice: null,
		noticeSelf: null,
		noticeFor: null,
		question: {
			askerId: subject,
			suspectId: pick.suspectId,
			roomId: pick.roomId,
			weaponId: pick.weaponId,
			timeId: pick.timeId,
			announcedRoomId: announced,
			cursor: 0,
			responderIds: order,
			skips: [],
			missId: null,
			showerId: null,
			matchingCardIds: [],
			shownCardId: null,
			shownToAsker: false,
			resolved: false,
			nobodyHad: false,
			silencedId
		}
	};
	const asked = formatQuestion(next, pick);
	const roomName = announced ? roomById(announced)?.name : "the hall";
	const silencedName = silencedId ? state.cards.find((c) => c.id === silencedId)?.name : "";
	const hushLine = silencedName ? ` The hush lifts: ${silencedName} is silenced, so no one shows it.` : "";
	return advanceQuestion(log(next, `${asker.name} (in the ${roomName}) asks: ${asked}${hushLine}`), secrets);
}

function spokenOrder(state, subject) {
	const order = rotateAfter(state.turnOrder, subject).filter((id) => {
		const seated = state.players.find((p) => p.id === id);
		return Boolean(seated && !seated.eliminated && seated.id !== subject);
	});
	for (const seated of state.players) {
		if (seated.eliminated || seated.id === subject || order.includes(seated.id)) continue;
		order.push(seated.id);
	}
	return order;
}
/**
 * Speak mode. The asker says the suggestion out loud and taps "I'm in a room".
 * The game never learns which cards were named. It only walks the table in order
 * and asks each player: do you have a card that was asked for?
 */
export function beginSpokenQuestion(state: GameState, playerId: string): GameState {
	if (!canAsk(state, playerId)) return state;
	const subject = subjectOf(state, playerId);
	if (!subject) return state;
	const asker = state.players.find((p) => p.id === subject);
	if (!asker) return state;
	const next = {
		...state,
		phase: "question",
		actionsLeft: 0,
		freeQuestion: false,
		whisperMode: false,
		naming: null,
		notice: null,
		noticeSelf: null,
		noticeFor: null,
		question: {
			askerId: subject,
			suspectId: "",
			roomId: "",
			weaponId: "",
			announcedRoomId: null,
			cursor: 0,
			responderIds: spokenOrder(state, subject),
			skips: [],
			missId: null,
			askingId: null,
			showerId: null,
			matchingCardIds: [],
			shownCardId: null,
			shownToAsker: false,
			resolved: false,
			nobodyHad: false,
			spoken: true
		}
	};
	return advanceSpoken(log(next, `${asker.name} is in a room and makes a suggestion out loud.`));
}
function advanceSpoken(state) {
	const q = state?.question;
	if (!q || !q.spoken || q.resolved) return state;
	let cursor = q.cursor ?? 0;
	while (cursor < q.responderIds.length) {
		const pid = q.responderIds[cursor];
		const responder = state.players.find((p) => p.id === pid);
		if (!responder || responder.eliminated || q.skips.includes(pid)) {
			cursor += 1;
			continue;
		}
		return {
			...state,
			question: {
				...q,
				cursor,
				askingId: pid,
				showerId: null,
				matchingCardIds: [],
				shownCardId: null
			}
		};
	}
	const line = "No one had a card to show.";
	return log({
		...state,
		phase: "action",
		actionsLeft: 1,
		question: null,
		notice: line,
		noticeSelf: null,
		noticeFor: null
	}, line);
}
/** The player being asked says whether they hold a card that was named. */
export function answerSpoken(state: GameState, playerId: string, has: boolean): GameState {
	const q = state?.question;
	if (!q?.spoken || state.phase !== "question" || q.resolved) return state;
	if (!q.askingId || q.askingId !== playerId) return state;
	const who = state.players.find((p) => p.id === playerId);
	if (has) {
		return log({
			...state,
			question: {
				...q,
				askingId: null,
				showerId: playerId,
				matchingCardIds: [],
				shownCardId: null
			}
		}, `${who?.name ?? "A guest"} has a card and will show it.`);
	}
	return advanceSpoken(log({
		...state,
		question: {
			...q,
			skips: [...q.skips, playerId],
			cursor: (q.cursor ?? 0) + 1,
			askingId: null
		}
	}, `${who?.name ?? "A guest"} has nothing to show.`));
}
/** Any card from the hand may be shown. Only the asker sees which one. */
export function chooseSpokenCard(state: GameState, secrets: Secrets, playerId: string, cardId: string): GameState {
	const q = state?.question;
	if (!q?.spoken || state.phase !== "question" || q.showerId !== playerId || q.shownCardId) return state;
	const hand = (secrets?.hands?.[playerId] ?? []).map(String);
	if (!hand.includes(String(cardId))) return state;
	if (!state.cards.some((card) => card.id === cardId)) return state;
	const shower = state.players.find((p) => p.id === playerId);
	const asker = state.players.find((p) => p.id === q.askerId);
	return log({
		...state,
		question: {
			...q,
			shownCardId: cardId,
			shownToAsker: false,
			cardShown: true
		}
	}, `${shower?.name ?? "A guest"} shows a card privately to ${asker?.name ?? "the asker"}.`);
}
function formatQuestion(state, pick) {
	const name = (id) => state.cards.find((c) => c.id === id)?.name ?? "—";
	const bits = [
		`Was it ${name(pick.suspectId)}`,
		`in the ${name(pick.roomId)}`,
		`with the ${name(pick.weaponId)}`
	];
	if (pick.timeId) bits.push(`at ${name(pick.timeId)}`);
	return `${bits.join(", ")}?`;
}
function rotateAfter(order, id) {
	const i = order.indexOf(id);
	if (i < 0) return order.slice();
	return [...order.slice(i + 1), ...order.slice(0, i)];
}
function advanceQuestion(state, secrets) {
	const q = state.question;
	if (!q || q.resolved) return state;
	let cursor = q.cursor;
	const skips = [...q.skips];
	while (cursor < q.responderIds.length) {
		const pid = q.responderIds[cursor];
		const responder = state.players.find((p) => p.id === pid);
		if (!responder || responder.eliminated || skips.includes(pid)) {
			cursor += 1;
			continue;
		}
		const asked = askedIds(q);
		const want = new Set(asked);
		const matches = cardsHeldBy(secrets, pid).filter((id) => want.has(id));
		if (matches.length === 0) {
			skips.push(pid);
			cursor += 1;
			continue;
		}
		if (state.autoShowTurn) {
			const cardId = matches[Math.floor(Math.random() * matches.length)];
			return {
				...state,
				autoShowTurn: false,
				question: {
					...q,
					cursor,
					skips,
					missId: null,
					showerId: pid,
					matchingCardIds: matches,
					shownCardId: cardId,
					shownToAsker: false
				}
			};
		}
		return {
			...state,
			question: {
				...q,
				cursor,
				skips,
				missId: null,
				showerId: pid,
				matchingCardIds: matches,
				shownCardId: null,
				shownToAsker: false
			}
		};
	}
	const asked = askedIds(q);
	const holder = otherHolder(state, secrets, q.askerId, asked);
	if (holder) {
		const want = new Set(asked);
		const matches = cardsHeldBy(secrets, holder).filter((id) => want.has(id));
		if (matches.length) {
			return {
				...state,
				phase: "question",
				question: {
					...q,
					cursor,
					skips,
					missId: null,
					showerId: holder,
					matchingCardIds: matches,
					shownCardId: null,
					shownToAsker: false,
					nobodyHad: false,
					offerAccusation: false
				}
			};
		}
	}
	const blocked = solutionBlocked(state, secrets, q.askerId, asked);
	if (blocked === "asker") {
		return {
			...state,
			phase: "question",
			actionsLeft: 0,
			question: {
				...q,
				cursor,
				skips,
				missId: null,
				showerId: null,
				matchingCardIds: [],
				shownCardId: null,
				nobodyHad: true,
				offerAccusation: false,
				closeTurn: true,
				resolved: false
			}
		};
	}
	if (blocked || !askedIsSolution(state, secrets, q)) {
		const text = blocked === "table" ? "One of those cards is face up on the table, so this is not the solution." : blocked ? "No one showed a card." : !coversSolution(state, q) ? "Name one card from each group before that can win the case." : "No one showed a card, but that set is not the case.";
		// Nobody at the table holds any of the named cards, and the asker
		// doesn't either — the turn ends on its own rather than waiting for a
		// manual tap. The asker's journal doesn't confirm this as the answer
		// until the next turn cycle (see pendingAnswer), not the instant it happens.
		const pendingAnswer = blocked
			? state.pendingAnswer ?? null
			: { ids: askedIds(q), askerId: q.askerId, turnIndex: state.turnIndex };
		const closed = log({
			...state,
			phase: "action",
			actionsLeft: 0,
			question: null,
			pendingAnswer
		}, text);
		return endTurn(closed, q.askerId);
	}
	return log({
		...state,
		phase: "action",
		actionsLeft: 1,
		question: {
			askerId: q.askerId,
			suspectId: q.suspectId,
			roomId: q.roomId,
			weaponId: q.weaponId,
			timeId: q.timeId,
			announcedRoomId: q.announcedRoomId,
			cursor: 0,
			responderIds: [],
			skips: [],
			missId: null,
			showerId: null,
			matchingCardIds: [],
			shownCardId: null,
			shownToAsker: false,
			resolved: true,
			nobodyHad: true,
			offerAccusation: true
		}
	}, "No one holds those cards. Name them to win.");
}
export function releaseQuestion(state, secrets) {
	const q = state?.question;
	if (!q || state.phase !== "question") return state;
	if (q.spoken) return state;
	if (q.heldByAsker) {
		return {
			...state,
			phase: "action",
			actionsLeft: 0,
			question: null
		};
	}
	if (q.missId) return acknowledgeMiss(state, secrets);
	if (q.showerId && !q.shownCardId) {
		const want = new Set(askedIds(q));
		const held = cardsHeldBy(secrets, q.showerId).filter((id) => want.has(id));
		if (held.length && !(q.matchingCardIds ?? []).length) {
			return { ...state, question: { ...q, matchingCardIds: held } };
		}
		if (!held.length) {
			return advanceQuestion({
				...state,
				question: {
					...q,
					cursor: (q.cursor ?? 0) + 1,
					showerId: null,
					matchingCardIds: [],
					missId: null
				}
			}, secrets);
		}
	}
	return state;
}
export function acknowledgeMiss(state, secrets) {
	const q = state.question;
	if (!q?.missId) return state;
	return advanceQuestion({
		...state,
		question: {
			...q,
			missId: null
		}
	}, secrets);
}
function askedIds(q) {
	return [q.suspectId, q.roomId, q.weaponId, q.timeId].filter(Boolean).map((id) => String(id)).filter((id) => id !== q.silencedId);
}
function cardsHeldBy(secrets, playerId) {
	const pile = secrets?.hands?.[playerId];
	return Array.isArray(pile) ? pile.map((id) => String(id)) : [];
}
function playerHolds(secrets, playerId, want) {
	return cardsHeldBy(secrets, playerId).some((id) => want.has(id));
}
function otherHolder(state, secrets, askerId, asked) {
	const want = new Set(asked);
	const skipped = new Set((state.question?.skips ?? []).map((id) => String(id)));
	const seen = new Set();
	for (const pid of rotateAfter(state.turnOrder ?? [], askerId)) {
		seen.add(pid);
		if (skipped.has(String(pid))) continue;
		const player = state.players.find((p) => p.id === pid);
		if (!player || player.eliminated) continue;
		if (playerHolds(secrets, pid, want)) return pid;
	}
	for (const player of state.players) {
		if (player.id === askerId || player.eliminated || seen.has(player.id) || skipped.has(String(player.id))) continue;
		if (playerHolds(secrets, player.id, want)) return player.id;
	}
	return null;
}
function solutionBlocked(state, secrets, askerId, asked) {
	const want = new Set(asked);
	if (playerHolds(secrets, askerId, want)) return "asker";
	if ((state.leftover ?? []).some((id) => want.has(String(id)))) return "table";
	for (const [playerId, pile] of Object.entries(secrets?.hands ?? {})) {
		if (playerId === askerId || !Array.isArray(pile)) continue;
		if (pile.some((id) => want.has(String(id)))) return "held";
	}
	return null;
}
function coversSolution(state, q) {
	const cats = state.settings?.timeOfDayEnabled ? ["suspect", "room", "weapon", "time"] : ["suspect", "room", "weapon"];
	const byId = new Map((state.cards ?? []).map((card) => [String(card.id), card.category]));
	const covered = new Set();
	for (const id of askedIds(q)) {
		const cat = byId.get(id);
		if (cat) covered.add(cat);
	}
	return cats.every((cat) => covered.has(cat));
}
function askedIsSolution(state, secrets, q) {
	if (!coversSolution(state, q)) return false;
	const sol = secrets?.solution ?? {};
	for (const id of askedIds(q)) {
		const card = (state.cards ?? []).find((item) => item.id === id);
		if (!card) return false;
		if (String(sol[card.category] ?? "") !== String(id)) return false;
	}
	return true;
}
export function chooseShownCard(state: GameState, playerId: string, cardId: string): GameState {
	const q = state.question;
	if (!q || q.showerId !== playerId) return state;
	if (!q.matchingCardIds.includes(cardId)) return state;
	const shower = state.players.find((p) => p.id === playerId);
	const asker = state.players.find((p) => p.id === q.askerId);
	return log({
		...state,
		question: {
			...q,
			shownCardId: cardId,
			shownToAsker: false,
			cardShown: true
		}
	}, `${shower?.name ?? "A guest"} shows a card privately to ${asker?.name ?? "the asker"}.`);
}
export function ackShownCard(state: GameState, playerId: string): GameState {
	const q = state.question;
	if (!q) return state;
	if (q.heldByAsker) {
		if (playerId !== q.askerId && !state.influences?.some((i) => i.victimId === q.askerId && i.controllerId === playerId)) return state;
		return endTurn({
			...state,
			phase: "action",
			actionsLeft: 0,
			question: null
		}, playerId);
	}
	if (q.nobodyHad && q.offerAccusation) return state;
	if (q.nobodyHad && (playerId === q.askerId || state.influences?.some((i) => i.victimId === q.askerId && i.controllerId === playerId))) {
		return {
			...state,
			phase: "action",
			actionsLeft: 1,
			question: {
				askerId: q.askerId,
				suspectId: q.suspectId,
				roomId: q.roomId,
				weaponId: q.weaponId,
				timeId: q.timeId,
				announcedRoomId: q.announcedRoomId,
				cursor: 0,
				responderIds: [],
				skips: [],
				missId: null,
				showerId: null,
				matchingCardIds: [],
				shownCardId: null,
				shownToAsker: false,
				resolved: true,
				nobodyHad: true,
				offerAccusation: true
			}
		};
	}
	if (!q.shownCardId) return state;
	if (playerId !== q.askerId && !state.influences?.some((i) => i.victimId === q.askerId && i.controllerId === playerId)) return state;
	return endTurn({
		...state,
		phase: "action",
		question: {
			...q,
			shownToAsker: true,
			resolved: true,
			matchingCardIds: []
		}
	}, playerId);
}
export function rememberReveal(secrets: Secrets, _fromId: string, _toId: string, _cardId: string): Secrets {
	return secrets;
}
function dealOutHand(hands, fromId, recipients) {
	const next = {};
	for (const [id, cards] of Object.entries(hands)) next[id] = [...cards];
	const pile = [...next[fromId] ?? []];
	next[fromId] = [];
	if (!pile.length || !recipients.length) return next;
	for (const id of recipients) next[id] = next[id] ?? [];
	const left = receiveQuotas(recipients, new Map(recipients.map((id) => [id, next[id].length])), pile.length);
	for (const cardId of fisherYates(pile)) {
		const open = recipients.filter((id) => (left.get(id) ?? 0) > 0);
		const pool = open.length ? open : recipients;
		const who = pool[Math.floor(Math.random() * pool.length)];
		next[who] = [...next[who], cardId];
		if ((left.get(who) ?? 0) > 0) left.set(who, (left.get(who) ?? 1) - 1);
	}
	return next;
}
function receiveQuotas(recipients, size, pileLen) {
	const total = [...size.values()].reduce((sum, n) => sum + n, 0) + pileLen;
	const base = Math.floor(total / Math.max(1, recipients.length));
	const receive = /* @__PURE__ */ new Map();
	let left = pileLen;
	const bySize = [...recipients].sort((a, b) => size.get(a) - size.get(b) || a.localeCompare(b));
	for (const id of bySize) {
		const give = Math.min(Math.max(0, base - size.get(id)), left);
		receive.set(id, give);
		left -= give;
	}
	const byFinal = [...recipients].sort((a, b) => {
		return size.get(a) + (receive.get(a) ?? 0) - (size.get(b) + (receive.get(b) ?? 0)) || a.localeCompare(b);
	});
	for (const id of byFinal) {
		if (left <= 0) break;
		receive.set(id, (receive.get(id) ?? 0) + 1);
		left -= 1;
	}
	return receive;
}
function namedId(state, id, category) {
	if (typeof id !== "string" || !id) return undefined;
	const card = state.cards.find((item) => item.id === id);
	return card && card.category === category ? id : undefined;
}
export function setNaming(state: GameState, playerId: string, pick): GameState {
	if (!pick || pick.clear) {
		if (!state.naming) return state;
		if (state.naming.playerId !== playerId && turnActorId(state) !== playerId) return state;
		return {
			...state,
			naming: null
		};
	}
	if (state.phase !== "action") return state;
	if ((state.actionsLeft ?? 1) <= 0) return state;
	const cur = currentPlayer(state);
	if (cur && (state.influences ?? []).some((item) => item.victimId === cur.id)) return state;
	if (!canAct(state, playerId)) return state;
	const subject = subjectOf(state, playerId);
	if (!subject) return state;
	const naming = {
		playerId: subject,
		suspectId: namedId(state, pick.suspectId, "suspect"),
		roomId: namedId(state, pick.roomId, "room"),
		weaponId: namedId(state, pick.weaponId, "weapon"),
		timeId: state.settings.timeOfDayEnabled ? namedId(state, pick.timeId, "time") : undefined
	};
	const prev = state.naming;
	if (prev && prev.playerId === naming.playerId && prev.suspectId === naming.suspectId && prev.roomId === naming.roomId && prev.weaponId === naming.weaponId && prev.timeId === naming.timeId) return state;
	return {
		...state,
		naming
	};
}
export function makeAccusation(state: GameState, playerId: string, pick, secrets: Secrets): { state: GameState; secrets: Secrets } {
	const held = { state, secrets };
	if (state.phase !== "action") return held;
	if ((state.actionsLeft ?? 1) <= 0) return held;
	const cur = currentPlayer(state);
	if (cur && (state.influences ?? []).some((i) => i.victimId === cur.id)) return held;
	const subject = subjectOf(state, playerId);
	if (!subject) return held;
	const player = state.players.find((p) => p.id === subject);
	if (!player || player.eliminated) return held;
	const sol = secrets.solution;
	const correct = sol.suspect === pick.suspectId && sol.room === pick.roomId && sol.weapon === pick.weaponId && (!state.settings.timeOfDayEnabled || sol.time === pick.timeId);
	const accusation = {
		playerId: subject,
		...pick,
		correct,
		at: Date.now()
	};
	if (correct) return {
		state: log({
			...state,
			phase: "gameover",
			winnerId: subject,
			accusation,
			question: null,
			event: null,
			naming: null
		}, `${player.name} names the truth. The case is closed.`),
		secrets
	};
	let next = {
		...state,
		accusation,
		naming: null,
		players: state.players.map((p) => p.id === subject && state.settings.wrongAccusationEliminates ? {
			...p,
			eliminated: true
		} : p)
	};
	if (state.settings.wrongAccusationEliminates) {
		next = {
			...next,
			influences: (next.influences ?? []).filter((i) => i.controllerId !== subject),
			spy: next.spy && next.spy.byId === subject ? null : next.spy
		};
	}
	let nextSecrets = secrets;
	if (state.settings.wrongAccusationEliminates) {
		const remaining = next.players.filter((p) => !p.eliminated).map((p) => p.id);
		nextSecrets = {
			...secrets,
			hands: dealOutHand(secrets.hands, subject, remaining)
		};
		next = log(next, `${player.name}'s Solve the Case attempt is wrong. Their cards pass to the guests still in.`);
		if (remaining.length === 1) {
			const last = next.players.find((p) => p.id === remaining[0]);
			return {
				state: log({
					...next,
					phase: "gameover",
					winnerId: remaining[0],
					naming: null
				}, `${last?.name ?? "The last guest"} is the only one still in, and takes the case.`),
				secrets: nextSecrets
			};
		}
	} else next = log(next, `${player.name}'s Solve the Case attempt is wrong.`);
	return {
		state: endTurn(next, playerId),
		secrets: nextSecrets
	};
}
export function endTurn(state: GameState, playerId: string): GameState {
	if (state.phase === "lobby" || state.phase === "gameover") return state;
	if (state.phase === "question" || state.phase === "event") return state;
	const actor = turnActorId(state);
	const seatedNow = currentPlayer(state)?.id;
	if (playerId !== actor && playerId !== seatedNow) return state;
	const finished = currentPlayer(state);
	const notesLock = { ...state.notesLock ?? {} };
	if (finished && (notesLock[finished.id] ?? 0) > 0) notesLock[finished.id] -= 1;
	let influences = (state.influences ?? []).filter((i) => i.victimId !== finished?.id);
	let skipIds = [...state.skipIds ?? []];
	const order = state.turnOrder.filter((id) => state.players.some((p) => p.id === id && !p.eliminated));
	if (!order.length) return { ...state, phase: "action", actionsLeft: 1, question: null, event: null };
	// Walk the full seating order, not the list with eliminated guests removed.
	// Otherwise a guest who was just eliminated has no seat in `order`, and the
	// next living guest is skipped.
	const seats = state.turnOrder;
	let start = seats.indexOf(finished?.id ?? "");
	if (start < 0) start = Math.max(0, state.turnIndex) % seats.length;
	const skipped = [];
	const handOff = (pid: string) => {
		const p = state.players.find((x) => x.id === pid);
		if (!p || p.eliminated) return null;
		const guide = influences.find((inf) => inf.victimId === p.id);
		const guideName = state.players.find((x) => x.id === guide?.controllerId)?.name;
		const lead = skipped.length ? `${skipped.join(" and ")} lost a turn to a clunk. ` : "";
		const extra = guide ? ` ${guideName} plays this turn, but may not accuse.` : "";
		let spy = state.spy ?? null;
		if (spy && finished && spy.byId === finished.id && !spy.armed) spy = { ...spy, armed: true };
		if (spy?.armed && pid === spy.byId) spy = null;
		const idx = state.turnOrder.indexOf(pid);
		return log({
			...state,
			spy,
			notesLock,
			influences,
			skipIds,
			turnIndex: idx < 0 ? 0 : idx,
			phase: "roll",
			dice: null,
			pace: null,
			singleDie: false,
			moveBudget: 0,
			actionsLeft: 0,
			freeQuestion: true,
			whisperMode: false,
			question: null,
			event: null,
			notice: null,
			noticeSelf: null,
			noticeFor: null,
			naming: null,
			wait: null,
			log: []
		}, `${lead}${p.name}'s turn.${extra}`);
	};
	for (let step = 1; step <= seats.length; step++) {
		const pid = seats[(start + step) % seats.length];
		if (pid === finished?.id && order.length > 1) continue;
		const p = state.players.find((x) => x.id === pid);
		if (!p || p.eliminated) continue;
		if (skipIds.includes(pid)) {
			skipIds = skipIds.filter((id) => id !== pid);
			skipped.push(p.name);
			continue;
		}
		const next = handOff(pid);
		if (next) return next;
	}
	const other = order.find((id) => id !== finished?.id);
	if (other) {
		const next = handOff(other);
		if (next) return next;
	}
	return { ...state, notesLock, influences, skipIds, phase: "roll", dice: null, actionsLeft: 0, question: null, event: null, notice: null, noticeSelf: null, noticeFor: null };
}
/** Everyone still in the game must agree. Then a stuck suggestion, power, or turn is cleared. */
export function voteSync(state: GameState, playerId: string, choice: { agree?: boolean; cancel?: boolean }): GameState {
	if (!state?.startedAt || state.phase === "lobby" || state.phase === "gameover") return state;
	const living = state.players.filter((player) => !player.eliminated);
	if (!living.some((player) => player.id === playerId)) return state;
	if (choice.cancel) return state.sync ? { ...state, sync: null } : state;
	if (!choice.agree) return state;
	const agreed = new Set((state.sync?.agreed ?? []).map(String));
	if (!state.sync) {
		return { ...state, sync: { byId: playerId, agreed: [playerId] } };
	}
	if (agreed.has(playerId)) return state;
	agreed.add(playerId);
	const next = [...agreed];
	if (!living.every((player) => agreed.has(player.id))) {
		return { ...state, sync: { byId: state.sync.byId, agreed: next } };
	}
	const cleared = {
		...state,
		phase: "action" as const,
		actionsLeft: 0,
		question: null,
		event: null,
		wait: null,
		notice: null,
		noticeSelf: null,
		noticeFor: null,
		naming: null,
		whisperMode: false,
		sync: null
	};
	const actor = turnActorId(cleared) ?? currentPlayer(cleared)?.id;
	return actor ? endTurn(cleared, actor) : cleared;
}
function copyPiles(hands) {
	const next = {};
	for (const [id, pile] of Object.entries(hands ?? {})) {
		next[id] = (Array.isArray(pile) ? pile : []).map((cardId) => String(cardId)).filter(Boolean).slice(0, 40);
	}
	return next;
}
/** Remember the hands from this round. An empty wipe is not saved. */
export function rememberRound(state, secrets) {
	const seated = (state?.players ?? []).filter((player) => !player.eliminated);
	const hands = secrets?.hands ?? {};
	if (!seated.some((player) => (hands[player.id] ?? []).length > 0)) return secrets;
	const roundHands = copyPiles(hands);
	const roundLeftover = (state.leftover ?? []).map((cardId) => String(cardId)).slice(0, 40);
	const prevHands = secrets.roundHands ?? {};
	const prevLeft = secrets.roundLeftover ?? [];
	const sameLeft = prevLeft.length === roundLeftover.length && prevLeft.every((id, index) => id === roundLeftover[index]);
	const keys = Object.keys(roundHands);
	const sameHands = keys.length === Object.keys(prevHands).length && keys.every((id) => {
		const next = roundHands[id];
		const prev = prevHands[id] ?? [];
		return next.length === prev.length && next.every((cardId, index) => cardId === prev[index]);
	});
	if (sameHands && sameLeft) return secrets;
	return { ...secrets, roundHands, roundLeftover };
}
/** Put the saved hands back. Used when a sync is agreed, or when every hand was wiped. */
export function restoreRound(state, secrets) {
	const saved = secrets?.roundHands;
	if (!saved || !state) return { state, secrets };
	const seated = (state.players ?? []).filter((player) => !player.eliminated);
	if (!seated.some((player) => (saved[player.id] ?? []).length > 0)) return { state, secrets };
	const hands = { ...(secrets.hands ?? {}) };
	for (const player of state.players ?? []) hands[player.id] = [...(saved[player.id] ?? hands[player.id] ?? [])];
	return {
		state: { ...state, leftover: [...(secrets.roundLeftover ?? state.leftover ?? [])] },
		secrets: { ...secrets, hands }
	};
}
export function healEmptyHands(state, secrets) {
	if (!state?.startedAt || state.phase === "lobby") return { state, secrets };
	const seated = (state.players ?? []).filter((player) => !player.eliminated);
	if (!seated.length) return { state, secrets };
	const empty = seated.every((player) => !(secrets?.hands?.[player.id]?.length));
	if (!empty) return { state, secrets };
	return restoreRound(state, secrets);
}
function activeCats(state) {
	return state?.settings?.timeOfDayEnabled ? ["suspect", "room", "weapon", "time"] : ["suspect", "room", "weapon"];
}
function openingDeal(state, secrets) {
	if (!state?.startedAt || state.phase === "lobby" || state.phase === "gameover") return false;
	if (state.phase !== "roll" || state.dice || state.question || state.event) return false;
	const hands = secrets?.hands ?? {};
	const dealt = Object.values(hands).some((pile) => Array.isArray(pile) && pile.length > 0);
	if (dealt) return false;
	if ((state.log ?? []).length > 4) return false;
	return true;
}
/** One answer from each group the host left on. Everyone else gets the same number of cards. */
function splitEven(state, secrets) {
	const cats = activeCats(state);
	const deck = (state.cards ?? []).filter((card) => cats.includes(card.category));
	const solution = { ...(secrets?.solution ?? {}) };
	for (const cat of cats) {
		const pile = deck.filter((card) => card.category === cat);
		if (!pile.length) {
			delete solution[cat];
			continue;
		}
		const current = solution[cat] ? String(solution[cat]) : "";
		if (!pile.some((card) => card.id === current)) solution[cat] = fisherYates(pile)[0].id;
	}
	const answers = new Set(Object.values(solution).filter(Boolean).map((id) => String(id)));
	const pool = fisherYates(deck.map((card) => card.id).filter((id) => !answers.has(id)));
	const players = (state.players ?? []).filter((player) => !player.eliminated);
	const hands = {};
	for (const player of state.players ?? []) hands[player.id] = [];
	if (!players.length) {
		return { state: { ...state, leftover: pool }, secrets: { ...secrets, solution, hands } };
	}
	const size = Math.floor(pool.length / players.length);
	const leftover = pool.slice(size * players.length);
	for (let i = 0; i < size * players.length; i++) hands[players[i % players.length].id].push(pool[i]);
	return { state: { ...state, leftover }, secrets: { ...secrets, solution, hands } };
}
function dealIsEven(state, secrets) {
	const cats = activeCats(state);
	const deck = (state.cards ?? []).filter((card) => cats.includes(card.category));
	const solution = secrets?.solution ?? {};
	const answers = new Set();
	for (const cat of cats) {
		const pile = deck.filter((card) => card.category === cat);
		if (!pile.length) continue;
		const sol = solution[cat] ? String(solution[cat]) : "";
		if (!pile.some((card) => card.id === sol)) return false;
		answers.add(sol);
	}
	const players = (state.players ?? []).filter((player) => !player.eliminated);
	if (!players.length) return true;
	const pool = deck.filter((card) => !answers.has(card.id)).length;
	const size = Math.floor(pool / players.length);
	if ((state.leftover ?? []).length !== pool % players.length) return false;
	return players.every((player) => (secrets.hands?.[player.id] ?? []).length === size);
}
export function ensureObjective(state, secrets) {
	if (!state?.startedAt) return { state, secrets };
	const sealed = sealAnswers(state, secrets);
	if (openingDeal(sealed.state, sealed.secrets)) {
		if (dealIsEven(sealed.state, sealed.secrets)) return sealed;
		return splitEven(sealed.state, sealed.secrets);
	}
	return sealed;
}
function answerSet(state, secrets) {
	const cats = activeCats(state);
	const ids = new Set();
	for (const cat of cats) {
		const id = secrets?.solution?.[cat];
		if (id) ids.add(String(id));
	}
	return ids;
}
/** The envelope is picked once and never dealt, shown, or swapped. */
function sealAnswers(state, secrets) {
	const cats = activeCats(state);
	const deck = (state.cards ?? []).filter((card) => cats.includes(card.category));
	const solution = { ...(secrets?.solution ?? {}) };
	let changed = false;
	const held = new Set<string>();
	for (const pile of Object.values(secrets?.hands ?? {})) {
		if (!Array.isArray(pile)) continue;
		for (const id of pile) held.add(String(id));
	}
	for (const cat of cats) {
		const pile = deck.filter((card) => card.category === cat);
		if (!pile.length) continue;
		const current = solution[cat] ? String(solution[cat]) : "";
		const currentOk = Boolean(current) && pile.some((card) => card.id === current) && !held.has(current);
		if (currentOk) continue;
		const free = pile.filter((card) => !held.has(card.id));
		if (!free.length) continue;
		solution[cat] = fisherYates(free)[0].id;
		changed = true;
	}
	const answers = new Set(Object.values(solution).filter(Boolean).map((id) => String(id)));
	const hands = secrets?.hands ?? {};
	const nextHands = {};
	for (const [id, pile] of Object.entries(hands)) {
		const next = (pile ?? []).map((cardId) => String(cardId)).filter((cardId) => cardId && !answers.has(cardId));
		nextHands[id] = next;
		if (next.length !== (pile ?? []).length) changed = true;
	}
	const leftover = (state.leftover ?? []).map((cardId) => String(cardId)).filter((cardId) => cardId && !answers.has(cardId));
	if (leftover.length !== (state.leftover ?? []).length) changed = true;
	const reveals = [];
	if ((secrets?.reveals ?? []).length) changed = true;
	if (!changed) return { state, secrets };
	return {
		state: { ...state, leftover },
		secrets: { ...secrets, solution, hands: nextHands, reveals }
	};
}
/** If the host's seat is empty, the next guest takes it. A started game is never closed for this. */
export function promoteHost(state: GameState): GameState {
	if (!state?.startedAt || state.phase === "lobby") return state;
	const seated = state.players.filter((p) => !p.eliminated);
	if (!seated.length) return state;
	if (seated.some((p) => p.id === state.hostId)) return state;
	const next = seated[0];
	return log({
		...state,
		hostId: next.id,
		players: state.players.map((p) => ({ ...p, isHost: p.id === next.id }))
	}, `${next.name} is the new host. The case goes on.`);
}
export function dropPlayer(state, secrets, playerId) {
	const player = state.players.find((p) => p.id === playerId);
	if (!player) return { state, secrets };
	const remaining = state.players.filter((p) => p.id !== playerId);
	if (!remaining.length) return { state, secrets };
	const wasTurn = state.turnOrder[state.turnIndex % Math.max(1, state.turnOrder.length)] === playerId;
	const removedAt = state.turnOrder.indexOf(playerId);
	const turnOrder = state.turnOrder.filter((id) => id !== playerId);
	let turnIndex = state.turnIndex;
	if (removedAt >= 0 && removedAt < turnIndex) turnIndex -= 1;
	if (turnIndex >= turnOrder.length) turnIndex = 0;
	const wasHost = state.hostId === playerId;
	const nextHost = wasHost ? remaining.find((p) => !p.eliminated) ?? remaining[0] : null;
	const hostId = nextHost?.id ?? state.hostId;
	const waited = (state.wait?.ids ?? []).filter((id) => id !== playerId);
	let next = {
		...state,
		hostId,
		players: remaining.map((p) => ({
			...p,
			isHost: p.id === hostId
		})),
		turnOrder,
		turnIndex,
		skipIds: (state.skipIds ?? []).filter((id) => id !== playerId),
		influences: (state.influences ?? []).filter((i) => i.victimId !== playerId && i.controllerId !== playerId),
		wait: waited.length && state.wait ? { ids: waited, since: state.wait.since } : null,
		naming: state.naming && state.naming.playerId !== playerId ? state.naming : null
	};
	const cats = state.settings?.timeOfDayEnabled ? ["suspect", "room", "weapon", "time"] : ["suspect", "room", "weapon"];
	const blocked = new Set(cats.map((cat) => secrets.solution?.[cat]).filter(Boolean).map((id) => String(id)));
	const sourceHands = {};
	for (const [id, cards] of Object.entries(secrets.hands ?? {})) {
		const list = Array.isArray(cards) ? cards.map((cardId) => String(cardId)) : [];
		sourceHands[id] = id === playerId ? list.filter((cardId) => !blocked.has(cardId)) : list;
	}
	const hands = dealOutHand(sourceHands, playerId, remaining.map((p) => p.id));
	delete hands[playerId];
	let secretsNext = {
		...secrets,
		hands,
		reveals: []
	};
	if (next.question && state.startedAt) {
		const q = next.question;
		if (q.askerId === playerId) {
			next = {
				...next,
				question: null,
				phase: "roll",
				actionsLeft: 0,
				dice: null,
				event: null
			};
		} else {
			const responderIds = q.responderIds.filter((id) => id !== playerId);
			const removedBefore = q.responderIds.slice(0, q.cursor).includes(playerId);
			next = {
				...next,
				question: {
					...q,
					responderIds,
					skips: q.skips.filter((id) => id !== playerId),
					cursor: Math.max(0, q.cursor - (removedBefore ? 1 : 0)),
					missId: q.missId === playerId ? null : q.missId,
					askingId: q.askingId === playerId ? null : q.askingId,
					showerId: q.showerId === playerId ? null : q.showerId,
					matchingCardIds: q.showerId === playerId ? [] : q.matchingCardIds
				}
			};
			if (q.spoken) {
				if (q.askingId === playerId || q.showerId === playerId) next = advanceSpoken(next);
			} else if (q.missId === playerId || q.showerId === playerId) {
				next = advanceQuestion(next, secretsNext);
			}
		}
	}
	if (wasTurn && next.phase !== "question" && next.phase !== "gameover") {
		next = {
			...next,
			phase: "roll",
			dice: null,
			pace: null,
			singleDie: false,
			moveBudget: 0,
			actionsLeft: 0,
			freeQuestion: true,
			whisperMode: false,
			event: null,
			accusation: null
		};
	}
	next = log(next, `${player.name} left the table. Their turn is skipped and their cards go to the other players.${nextHost ? ` ${nextHost.name} is the new host.` : ""}`);
	const fixed = ensureObjective(next, secretsNext);
	if (fixed.state.startedAt && fixed.state.phase !== "gameover" && fixed.state.players.length === 1) {
		return { state: awardLastPlayer(fixed.state, fixed.secrets), secrets: fixed.secrets };
	}
	return fixed;
}
function awardLastPlayer(state, secrets) {
	const last = state.players[0];
	const sol = secrets?.solution ?? {};
	return log({
		...state,
		phase: "gameover",
		winnerId: last?.id ?? null,
		question: null,
		event: null,
		wait: null,
		naming: null,
		accusation: {
			playerId: last?.id ?? "",
			suspectId: sol.suspect ?? "",
			roomId: sol.room ?? "",
			weaponId: sol.weapon ?? "",
			timeId: sol.time,
			correct: true
		}
	}, `${last?.name ?? "The last guest"} names the truth. The case is closed.`);
}
export function accusationHits(state, secrets, playerId) {
	const acc = state?.accusation;
	if (!acc || acc.correct || acc.playerId !== playerId || state.phase === "gameover") return null;
	const sol = secrets?.solution ?? {};
	const cats = state.settings?.timeOfDayEnabled ? ["suspect", "room", "weapon", "time"] : ["suspect", "room", "weapon"];
	const field = {
		suspect: "suspectId",
		room: "roomId",
		weapon: "weaponId",
		time: "timeId"
	};
	const hits = {};
	for (const cat of cats) hits[cat] = String(sol[cat] ?? "") === String(acc[field[cat]] ?? "");
	return hits;
}
//#endregion
