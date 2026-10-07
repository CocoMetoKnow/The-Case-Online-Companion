// @ts-nocheck
import { EVENT_DEFS, EVENT_MIN_PLAYERS, MIN_CATEGORY_CARDS, UNDERGROUND_PASSAGES, applyClassicNames, avatarCharacters, cardsByCategory, eventsForPlayers } from "./cards";
import { blockedHallsFor, expandPassages, isQuestionRoom, layoutFor, posKey, reachable, resolvePassages, roomLabel, shuffledStarts } from "./board";
import { NPC_ID, PLAYER_COLORS, type GameState, type PiecePos, type Secrets } from "./types";
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
					...layoutFor(settings).starts[0]
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
			...layoutFor(state.settings).starts[seat % layoutFor(state.settings).starts.length]
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
/**
 * The rooms that are really in this game: the room cards of the deck being played
 * (narrowed to the enabled list when there is one). Secret passages and every
 * "move someone to this room" power may only name these rooms. No hall hub, no
 * room from a deck that was not chosen.
 */
export function roomsInPlay(state: GameState): string[] {
	const fromCards = (state.cards ?? []).filter((c) => c.category === "room").map((c) => c.id);
	const enabled = state.settings?.enabledRoomIds ?? [];
	if (!enabled.length) return fromCards;
	const both = fromCards.filter((id) => enabled.includes(id));
	return both.length ? both : fromCards;
}
/**
 * "Pick Your Character". The picture is that character's art, one guest per character. Any
 * character in the game can be picked, not only the suspects dealt into this deck.
 * Hot-seat and in-person tables share one device, so any seat can be set from it; online,
 * a phone may only set its own seat.
 */
export function setAvatar(state: GameState, from: string, targetId: string, cardId: string): GameState {
	if (!state?.players || state.phase === "gameover") return state;
	const who = targetId || from;
	if (who !== from && state.settings?.playMode === "online") return state;
	const player = state.players.find((p) => p.id === who);
	if (!player) return state;
	if (!cardId) {
		if (!player.avatar) return state;
		return { ...state, players: state.players.map((p) => p.id === who ? { ...p, avatar: void 0 } : p) };
	}
	const card = avatarCharacters(state.cards).find((c) => c.id === cardId);
	if (!card) return state;
	if (state.players.some((p) => p.id !== who && p.avatar === cardId)) return state;
	if (player.avatar === cardId) return state;
	return { ...state, players: state.players.map((p) => p.id === who ? { ...p, avatar: cardId } : p) };
}
/** The "clue" easter egg. Any seated guest can flip it in the lobby; it renames the suspects for the whole table. */
export function setClassicNames(state, from, on) {
	if (!state?.players || state.startedAt || state.phase !== "lobby") return state;
	if (!state.players.some((p) => p.id === from)) return state;
	const next = Boolean(on);
	if (Boolean(state.settings?.classicNames) === next) return state;
	return {
		...state,
		settings: { ...state.settings, classicNames: next },
		cards: applyClassicNames(state.cards, next)
	};
}
/** The "DB" code in the lobby. Only the host can flip it. The host's phone builds the matching deck and settings. */
export function setBoardMode(state, from, data) {
	if (!state?.players || state.startedAt || state.phase !== "lobby") return state;
	if (from !== state.hostId) return state;
	if (!Array.isArray(data?.cards) || !data.settings) return state;
	if (data.settings.table === "board" && state.players.length > data.settings.maxPlayers) return state;
	return {
		...state,
		settings: { ...state.settings, ...data.settings },
		cards: data.cards
	};
}
export const CHAT_KEEP = 60;
export const CHAT_MAX_LENGTH = 240;
/** The in-game chat. Any seated guest (even one who is out of the case) can talk at any time. It never touches the turn. */
export function sendChat(state, from, text, id = uid("chat")) {
	if (!state?.players || !state.startedAt) return state;
	const player = state.players.find((p) => p.id === from);
	if (!player) return state;
	const clean = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
	if (!clean) return state;
	const message = { id, fromId: from, name: player.name, text: clean, at: Date.now() };
	return { ...state, chat: [...(state.chat ?? []), message].slice(-CHAT_KEEP) };
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
	// The digital board seats everyone on a random blue circle square, one each.
	const spawnOrder = state.settings?.table === "board" ? shuffledStarts(layoutFor(state.settings), Math.random, state.players.length) : layoutFor(state.settings).starts;
	const players = state.players.map((p, i) => ({
		...p,
		seat: i,
		eliminated: false,
		position: {
			kind: "hall" as const,
			...spawnOrder[i % spawnOrder.length]
		}
	}));
	const spawns = Object.fromEntries(players.map((p) => [p.id, { x: (p.position as { x: number }).x, y: (p.position as { y: number }).y }]));
	const order = fisherYates(players.map((p) => p.id));
	// The digital board opens with the two passages the host set (Study to Kitchen and Lounge to Conservatory by default).
	const passages = state.settings?.table === "board" ? expandPassages(resolvePassages(state.settings.enabledRoomIds, state.settings.boardPassages)) : makePassages(state.settings.enabledRoomIds);
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
		...(state.settings?.table === "board" ? { spawns } : {}),
		skipIds: [],
		notesLock: {},
		influences: [],
		wait: null,
		naming: null,
		log: [],
		spy: null,
		hush: null,
		sync: null,
		speedBoost: null,
		shortDieId: null,
		pace: null,
		singleDie: false,
		extraDie: null,
		gambler: null,
		bonusRoom: null,
		notice: null,
		noticeSelf: null,
		noticeFor: null,
		lastSuggestion: null,
		suggestedIn: {},
		privateShow: null
	};
	const split = splitEven(started, { solution: {}, hands: {} });
	// Lock the answers in. From here on nothing may re-pick, swap or deal them.
	split.secrets = { ...split.secrets, envelope: { ...split.secrets.solution } };
	const nameOf = (id) => roomLabel(state, id, layoutFor(state.settings));
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
		// Only the player who drew the power-up confirms the reveal. Everyone else just reads along, so the
		// shared phone must go to the seat on turn, not to whoever is first in the player list.
		if (ev.step === "reveal") return [String(turnActorId(state) ?? currentPlayer(state)?.id ?? "")].filter(Boolean);
		if (ev.step === "ack" || ev.step === "show-all") {
			const key = ev.step === "ack" ? "acked" : "seen";
			const seen = new Set(Array.isArray(ev.data?.[key]) ? (ev.data[key] as string[]).map(String) : []);
			for (const player of state.players) if (!player.eliminated && !seen.has(player.id)) add(player.id);
			return [...ids];
		}
		if (ev.data?.waitingId) add(String(ev.data.waitingId));
		// Swap a Card: the other guest picks which card to hand back, so the shared phone goes to them.
		else if (ev.kind === "swap-card" && ev.step === "pick-take" && ev.data?.targetId) add(String(ev.data.targetId));
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
/** Speed Boost triples every roll the player makes for as long as it lasts. */
export const SPEED_BOOST_MULTIPLIER = 3;
/** Turns a Speed Boost lasts, counting the turn it was played in. */
export const SPEED_BOOST_TURNS = 2;
function boostFor(state: GameState, playerId: string | undefined): number {
	const boost = state.speedBoost;
	return boost && playerId && boost.playerId === playerId && boost.turns > 0 ? SPEED_BOOST_MULTIPLIER : 1;
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
		const moveOne = d * boostFor(state, actor.id);
		const next = log({
			...state,
			dice: [d, d],
			singleDie: true,
			shortDieId: null,
			pace: moveOne,
			moveBudget: moveOne,
			naming: null,
			phase: board ? "move" : "action",
			actionsLeft: 1,
			event: again ? null : state.event
		}, `${actor.name} rolls. Move ${moveOne}.`);
		return { state: next, snakeEyes: false };
	}
	const d1 = 1 + Math.floor(Math.random() * 6);
	const d2 = 1 + Math.floor(Math.random() * 6);
	const glass = d1 === 3;
	const snakeEyes = d1 === 1 && d2 === 1;
	const boost = boostFor(state, actor?.id);
	const total = ((glass ? 0 : d1) + d2) * boost;
	let next = {
		...state,
		dice: [d1, d2],
		singleDie: false,
		moveBudget: snakeEyes ? 0 : total,
		...(boost > 1 && !snakeEyes ? { pace: total } : {}),
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
		if (thenMode === "resume") {
			// A power that moves someone else (or marks a passage) leaves the roll to be walked.
			// One that moves the player who is rolling takes the place of that walk.
			const movesRoller = ["move-anywhere", "fast-track", "shortcut", "trade-places", "lost-in-hall"].includes(String(state.event?.kind));
			if (!movesRoller && (state.moveBudget ?? 0) > 0) return {
				...state,
				phase: "move",
				event: null,
				actionsLeft: 1
			};
			return {
				...state,
				phase: "action",
				event: null,
				moveBudget: 0,
				actionsLeft: 1
			};
		}
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
		if (!roomsInPlay(state).includes(dest.roomId)) return state;
		const moved = placePlayer(state, subject, dest);
		const roomName = roomLabel(state, dest.roomId, layoutFor(state.settings));
		const noted = log({
			...moved,
			moveBudget: 0,
			actionsLeft: 1
		}, `${player.name} takes a hidden passage into the ${roomName}.`);
		return holdForBoard(noted, `On the physical board, move ${player.name}'s piece into the ${roomName}.`, "resume");
	}
	const blocked = blockedHallsFor(state.players, subject);
	const { nodes } = reachable(player.position, state.moveBudget, state.settings.enabledRoomIds, state.passages ?? [], blocked, layoutFor(state.settings));
	const key = dest.kind === "hall" ? `h:${dest.x},${dest.y}` : `r:${dest.roomId}`;
	const node = nodes.get(key);
	if (!node || node.dist < 1) return state;
	// One tap goes the whole way: any square the roll can reach is a legal destination.
	// The board animates the path it took.
	const step: PiecePos = dest.kind === "hall" ? { kind: "hall", x: dest.x, y: dest.y } : { kind: "room", roomId: dest.roomId };
	const moved = placePlayer(state, subject, step);
	const fromRoom = player.position.kind === "room" ? player.position.roomId : null;
	const toRoom = step.kind === "room" ? step.roomId : null;
	const entered = toRoom != null;
	// Choosing where to stand is the whole move, so a tap that lands in the corridor ends it too.
	const toRoomLabel = toRoom ? roomLabel(state, toRoom, layoutFor(state.settings)) : "";
	const text = fromRoom && toRoom && fromRoom !== toRoom ? `${player.name} takes the passage into the ${toRoomLabel}.` : entered ? `${player.name} steps into the ${toRoomLabel}.` : `${player.name} stops in the corridor.`;
	// On the digital board a tap only costs the steps it actually took. Whatever is left over can be walked later, out of
	// a room by a door, through a secret passage, or on along the corridor, until the player taps Stay here.
	const left = Math.max(0, (state.moveBudget ?? 0) - node.dist);
	const keepGoing = left > 0 && state.settings?.table === "board";
	return log({
		...moved,
		phase: keepGoing ? "move" : "action",
		moveBudget: keepGoing ? left : 0
	}, text);
}
export function placePlayer(state, playerId, dest) {
	// "No repeat room": walking into a different room frees the guest to suggest again.
	const lastRoom = state.suggestedIn?.[playerId];
	const freed = Boolean(lastRoom && dest.kind === "room" && dest.roomId !== lastRoom);
	if (freed) {
		const { [playerId]: _gone, ...rest } = state.suggestedIn;
		state = { ...state, suggestedIn: rest };
	}
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
/** Digital board, "no repeat room" on: this guest's last suggestion was in the room they are standing in. */
export function repeatBlocked(state: GameState, playerId: string): boolean {
	if (state.settings?.table !== "board" || !state.settings.noRepeatRoom) return false;
	const subject = subjectOf(state, playerId);
	const p = subject ? state.players.find((x) => x.id === subject) : null;
	if (!p || p.position.kind !== "room") return false;
	// A won gamble gives a bonus suggestion that may name any room, so it is never blocked.
	if (state.bonusRoom?.playerId === p.id) return false;
	return state.suggestedIn?.[p.id] === p.position.roomId;
}
/** Remember where a guest just made a suggestion, when the "no repeat room" rule is on. */
function markSuggested(state: GameState, subject: string): GameState {
	if (state.settings?.table !== "board" || !state.settings.noRepeatRoom) return state;
	const p = state.players.find((x) => x.id === subject);
	if (!p || p.position.kind !== "room") return state;
	return { ...state, suggestedIn: { ...(state.suggestedIn ?? {}), [subject]: p.position.roomId } };
}
export function canAsk(state: GameState, playerId: string): boolean {
	// On the digital board a guest standing in a room may suggest while they still have steps left to walk.
	if (state.phase !== "action" && !(state.phase === "move" && state.settings?.table === "board")) return false;
	if (state.question?.offerAccusation) return false;
	if ((state.actionsLeft ?? 1) <= 0) return false;
	const subject = subjectOf(state, playerId);
	if (!subject) return false;
	const p = state.players.find((x) => x.id === subject);
	if (!p || p.eliminated) return false;
	// The digital board: a suggestion can only be made from inside a room. No power, passage, or speak mode changes that.
	if (state.settings?.table === "board") {
		if (repeatBlocked(state, playerId)) return false;
		return isQuestionRoom(p.position, state.settings.enabledRoomIds, layoutFor(state.settings));
	}
	// Speak mode plays on the real board. The player says they are in a room and that is enough.
	if (state.settings?.speakMode) return true;
	if (state.settings.playMode === "online" || state.freeQuestion) return true;
	return isQuestionRoom(p.position, state.settings.enabledRoomIds, layoutFor(state.settings));
}
/** Extra Difficulty is on: the NPC holds cards. */
function noShowLine(state) {
	return state?.settings?.extraDifficulty ? "No one showed a card, but the NPC may have shown this player a card." : "No one showed a card.";
}
function npcOn(state) {
	return Boolean(state?.settings?.extraDifficulty);
}
/**
 * The NPC is the last stop. If nobody at the table could show a card and the NPC holds one of the
 * named cards, it picks one at random. Needs the secrets, and a suggestion whose cards are known.
 */
function npcPick(state, secrets, q) {
	if (!npcOn(state) || !secrets || !q) return null;
	const want = new Set(askedIds(q));
	if (!want.size) return null;
	const matches = cardsHeldBy(secrets, NPC_ID).filter((id) => want.has(id));
	if (!matches.length) return null;
	return matches[Math.floor(Math.random() * matches.length)];
}
/** A card was just shown. If the asker made a Gambler bet, the bet is settled here. */
function markShown(q, state, cardId) {
	const card = (state.cards ?? []).find((c) => String(c.id) === String(cardId));
	const bet = q.gamble?.category;
	const result = bet && card ? (card.category === bet ? "won" : "lost") : (q.gambleResult ?? null);
	return { ...q, shownCardId: cardId, shownToAsker: false, cardShown: true, gambleResult: result };
}
/** Gambler: a bet only stands if the asker did not name a card they hold. Otherwise it is called off and the table is told. */
function settleBet(state, subject, askedList, secrets) {
	const bet = state.gambler;
	if (!bet || bet.playerId !== subject) return { gamble: null, off: false, line: "" };
	const name = state.players.find((p) => p.id === subject)?.name ?? "A guest";
	const mine = new Set(cardsHeldBy(secrets, subject));
	if (askedList.some((id) => mine.has(String(id)))) {
		return { gamble: null, off: true, line: `${name} has chosen not to gamble.` };
	}
	return { gamble: { category: bet.category }, off: false, line: `${name} is gambling on this suggestion.` };
}
export function beginQuestion(state: GameState, playerId: string, pick, secrets: Secrets): GameState {
	if (state.settings?.speakMode) return beginSpokenQuestion(state, playerId, pick, secrets);
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
	const bet = settleBet(state, subject, ids, secrets);
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
		moveBudget: 0,
		freeQuestion: false,
		whisperMode: false,
		naming: null,
		notice: null,
		noticeSelf: null,
		noticeFor: null,
		gambler: state.gambler && state.gambler.playerId === subject ? null : state.gambler ?? null,
		question: {
			askerId: subject,
			gamble: bet.gamble,
			gambleOff: bet.off,
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
	// Gambler bonus suggestion: any room may be named, and the asker's piece moves into it too.
	const bonus = state.bonusRoom?.playerId === subject;
	let nextState = bonus ? { ...next, bonusRoom: null } : next;
	if (bonus && announced && roomsInPlay(state).includes(String(announced))) {
		nextState = placePlayer(nextState, subject, { kind: "room", roomId: String(announced) });
	}
	const asked = formatQuestion(nextState, pick);
	const roomName = announced ? roomLabel(state, String(announced), layoutFor(state.settings)) : "the hall";
	const silencedName = silencedId ? state.cards.find((c) => c.id === silencedId)?.name : "";
	const hushLine = silencedName ? ` The hush lifts: ${silencedName} is silenced, so no one shows it.` : "";
	const betLine = bet.line ? ` ${bet.line}` : "";
	const moveLine = bonus ? ` ${asker.name} moves into the ${roomName}.` : "";
	return advanceQuestion(log(markSuggested(nextState, subject), `${asker.name} (in the ${roomName}) asks: ${asked}${hushLine}${betLine}${moveLine}`), secrets);
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
export function beginSpokenQuestion(state: GameState, playerId: string, pick?, secrets?: Secrets): GameState {
	if (!canAsk(state, playerId)) return state;
	const subject = subjectOf(state, playerId);
	if (!subject) return state;
	const asker = state.players.find((p) => p.id === subject);
	if (!asker) return state;
	// The cards are still said out loud and the table is still asked the same way. The picks only stay on
	// the asker's screen as a reminder, and let the NPC know what to look for when Extra Difficulty is on.
	const known = (id) => (typeof id === "string" && state.cards.some((c) => c.id === id) ? id : "");
	const picked = {
		suspectId: known(pick?.suspectId),
		roomId: known(pick?.roomId),
		weaponId: known(pick?.weaponId),
		timeId: known(pick?.timeId) || undefined
	};
	const namedIds = [picked.suspectId, picked.roomId, picked.weaponId, picked.timeId].filter(Boolean);
	// Whisper: a power-up that limits this suggestion to three cards, in speak mode too.
	if (state.whisperMode && namedIds.length > 3) return state;
	const bet = settleBet(state, subject, namedIds, secrets);
	// Hush: if the asker names the hushed card (and did not hush it themselves) the hush lifts and nobody shows that card.
	const hush = state.hush;
	const hushHit = Boolean(hush && hush.byId !== subject && namedIds.map(String).includes(hush.cardId));
	const silencedId = hushHit ? hush?.cardId ?? null : null;
	const silencedName = silencedId ? state.cards.find((c) => c.id === silencedId)?.name : "";
	const hushLine = silencedName ? ` The hush lifts: ${silencedName} is silenced, so no one shows it.` : "";
	// Gambler bonus: any room may be named, and the asker's piece goes into it on the real board.
	const bonus = state.bonusRoom?.playerId === subject;
	const bonusRoomName = bonus && picked.roomId ? state.cards.find((c) => c.id === picked.roomId)?.name : "";
	const bonusLine = bonusRoomName ? ` ${asker.name} moves into the ${bonusRoomName} on the board.` : "";
	const next = {
		...state,
		hush: hushHit ? null : hush ?? null,
		phase: "question",
		actionsLeft: 0,
		moveBudget: 0,
		freeQuestion: false,
		whisperMode: false,
		naming: null,
		notice: null,
		noticeSelf: null,
		noticeFor: null,
		gambler: state.gambler && state.gambler.playerId === subject ? null : state.gambler ?? null,
		bonusRoom: state.bonusRoom?.playerId === subject ? null : state.bonusRoom ?? null,
		question: {
			askerId: subject,
			gamble: bet.gamble,
			gambleOff: bet.off,
			suspectId: picked.suspectId,
			roomId: picked.roomId,
			weaponId: picked.weaponId,
			timeId: picked.timeId,
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
			spoken: true,
			silencedId
		}
	};
	return advanceSpoken(log(markSuggested(next, subject), `${asker.name} is in a room and makes a suggestion out loud.${bet.line ? ` ${bet.line}` : ""}${hushLine}${bonusLine}`), secrets);
}
function advanceSpoken(state, secrets?) {
	const q = state?.question;
	if (!q || !q.spoken || q.resolved) return state;
	let cursor = q.cursor ?? 0;
	const skips = [...q.skips];
	// Stealth Auto-Reveal: nobody is asked out loud. The first player holding a named card sends one, secretly.
	const stealth = Boolean(state.autoShowTurn && secrets && askedIds(q).length);
	while (cursor < q.responderIds.length) {
		const pid = q.responderIds[cursor];
		const responder = state.players.find((p) => p.id === pid);
		if (!responder || responder.eliminated || q.skips.includes(pid)) {
			cursor += 1;
			continue;
		}
		if (stealth) {
			const want = new Set(askedIds(q));
			const matches = cardsHeldBy(secrets, pid).filter((id) => want.has(id));
			if (!matches.length) {
				skips.push(pid);
				cursor += 1;
				continue;
			}
			const cardId = matches[Math.floor(Math.random() * matches.length)];
			const askerName = state.players.find((p) => p.id === q.askerId)?.name ?? "the asker";
			return log({
				...state,
				autoShowTurn: false,
				question: markShown({ ...q, cursor, skips, askingId: null, showerId: pid, matchingCardIds: matches, stealth: true }, state, cardId)
			}, `A card was sent secretly to ${askerName}.`);
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
	// Extra Difficulty: the NPC is asked last. It tells nobody but the asker.
	const npcCard = npcPick(state, secrets, q);
	if (npcCard) {
		return {
			...state,
			question: markShown({ ...q, cursor, askingId: null, showerId: NPC_ID, matchingCardIds: [], npcShown: true }, state, npcCard)
		};
	}
	// Extra Difficulty: the turn must not end by itself here. When the NPC shows a card the turn waits for the
	// asker, so an empty search waits for the asker too. They tap "End your turn", and nobody can read the timing.
	if (npcOn(state)) {
		return { ...state, question: { ...q, cursor, askingId: null, showerId: null, matchingCardIds: [], closeTurn: true } };
	}
	// Nobody at the table had a card to show. The turn ends right here, the same way it does when a
	// suggestion comes up empty in the normal game. It never waits for the asker to tap "end turn".
	const line = "No one had a card to show.";
	const closed = log({
		...state,
		autoShowTurn: stealth ? false : state.autoShowTurn,
		phase: "action",
		actionsLeft: 0,
		question: null,
		notice: null,
		noticeSelf: null,
		noticeFor: null
	}, line);
	const next = endTurn(closed, q.askerId);
	// endTurn clears the banner for the new turn. Put the result back so the whole table sees why the turn moved on.
	return next === closed ? next : { ...next, notice: `${line} ${state.players.find((p) => p.id === q.askerId)?.name ?? "The asker"}'s turn is over.` };
}
/** The player being asked says whether they hold a card that was named. */
export function answerSpoken(state: GameState, playerId: string, has: boolean, retract = false, secrets?: Secrets): GameState {
	const q = state?.question;
	if (!q?.spoken || state.phase !== "question" || q.resolved) return state;
	if (retract) {
		// The player said Yes, then admitted they have no card. Only possible before a card is picked.
		if (q.showerId !== playerId || q.shownCardId) return state;
		const quitter = state.players.find((p) => p.id === playerId);
		return advanceSpoken(log({
			...state,
			question: {
				...q,
				skips: q.skips.includes(playerId) ? q.skips : [...q.skips, playerId],
				cursor: (q.cursor ?? 0) + 1,
				askingId: null,
				showerId: null,
				matchingCardIds: [],
				shownCardId: null
			}
		}, `${quitter?.name ?? "A guest"} has nothing to show.`), secrets);
	}
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
	}, `${who?.name ?? "A guest"} has nothing to show.`), secrets);
}
/** Any card from the hand may be shown. Only the asker sees which one. */
export function chooseSpokenCard(state: GameState, secrets: Secrets, playerId: string, cardId: string): GameState {
	const q = state?.question;
	if (!q?.spoken || state.phase !== "question" || q.showerId !== playerId || q.shownCardId) return state;
	const hand = (secrets?.hands?.[playerId] ?? []).map(String);
	if (!hand.includes(String(cardId))) return state;
	if (!state.cards.some((card) => card.id === cardId)) return state;
	if (q.silencedId && String(cardId) === String(q.silencedId)) return state;
	const shower = state.players.find((p) => p.id === playerId);
	const asker = state.players.find((p) => p.id === q.askerId);
	return log({
		...state,
		question: markShown(q, state, cardId)
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
				question: markShown({
					...q,
					cursor,
					skips,
					missId: null,
					showerId: pid,
					matchingCardIds: matches
				}, state, cardId)
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
	// Extra Difficulty: the NPC is asked last. It tells nobody but the asker.
	const npcCard = npcPick(state, secrets, q);
	if (npcCard) {
		return {
			...state,
			phase: "question",
			question: markShown({
				...q,
				cursor,
				skips,
				missId: null,
				showerId: NPC_ID,
				matchingCardIds: [],
				nobodyHad: false,
				offerAccusation: false,
				npcShown: true
			}, state, npcCard)
		};
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
		const text = blocked === "table" ? "One of those cards is face up on the table, so this is not the solution." : blocked ? noShowLine(state) : !coversSolution(state, q) ? "Name one card from each group before that can win the case." : "No one showed a card, but that set is not the case.";
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
	// The suggestion named the whole solution: nobody holds any of it, and the asker does not either.
	// That ends the turn right here. It does NOT roll into a Solve the Case prompt. The asker's own
	// journal is told privately (pendingAnswer) and they may solve on their next turn, not this one.
	// The public line is the same neutral text as every other empty search, so the table cannot
	// tell this apart from "the asker holds one of those cards".
	const solved = log({
		...state,
		phase: "action",
		actionsLeft: 0,
		question: null,
		naming: null,
		pendingAnswer: { ids: askedIds(q), askerId: q.askerId, turnIndex: state.turnIndex }
	}, noShowLine(state));
	return endTurn(solved, q.askerId);
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
		question: markShown(q, state, cardId)
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
	if (q.nobodyHad) {
		// Never turn an empty search into a Solve the Case prompt. The turn simply ends.
		if (playerId !== q.askerId && !state.influences?.some((i) => i.victimId === q.askerId && i.controllerId === playerId)) return state;
		return endTurn({
			...state,
			phase: "action",
			actionsLeft: 0,
			question: null,
			pendingAnswer: state.pendingAnswer ?? { ids: askedIds(q), askerId: q.askerId, turnIndex: state.turnIndex }
		}, playerId);
	}
	if (!q.shownCardId) return state;
	if (playerId !== q.askerId && !state.influences?.some((i) => i.victimId === q.askerId && i.controllerId === playerId)) return state;
	const gamblerName = state.players.find((p) => p.id === q.askerId)?.name ?? "The asker";
	if (q.gambleResult === "won") {
		// Right call: the same player makes another suggestion.
		// The whole table is told: the bonus suggestion can name any room, but the piece goes there too.
		const line = `${gamblerName} won the gamble and gets a bonus suggestion. It can name any room, but ${gamblerName}'s character must move into that room too.`;
		return log({
			...state,
			bonusRoom: { playerId: q.askerId },
			freeQuestion: true,
			phase: "action",
			actionsLeft: 1,
			question: null,
			notice: line,
			noticeSelf: null,
			noticeFor: null
		}, line);
	}
	const ended = endTurn({
		...state,
		phase: "action",
		question: {
			...q,
			shownToAsker: true,
			resolved: true,
			matchingCardIds: []
		}
	}, playerId);
	if (q.gambleResult === "lost" && ended.phase !== "action") {
		// Wrong call: the card was never seen. The turn is over, and the table hears why.
		return { ...ended, notice: `${gamblerName} lost the gamble and did not get to see the card.`, noticeSelf: null, noticeFor: null };
	}
	return ended;
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
	if (!accuseOpen(state)) return state;
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
export function setSuggesting(state: GameState, playerId: string, pick: { suspectId?: unknown; roomId?: unknown; weaponId?: unknown; timeId?: unknown; clear?: unknown } | null): GameState {
	if (!pick || pick.clear) {
		if (!state.suggesting) return state;
		if (state.suggesting.playerId !== playerId && turnActorId(state) !== playerId) return state;
		return { ...state, suggesting: null };
	}
	if (state.phase !== "action" || state.question) return state;
	if ((state.actionsLeft ?? 1) <= 0) return state;
	const cur = currentPlayer(state);
	if (cur && (state.influences ?? []).some((item) => item.victimId === cur.id)) return state;
	if (!canAct(state, playerId)) return state;
	const subject = subjectOf(state, playerId);
	if (!subject) return state;
	const next = {
		playerId: subject,
		suspectId: namedId(state, pick.suspectId, "suspect"),
		roomId: namedId(state, pick.roomId, "room"),
		weaponId: namedId(state, pick.weaponId, "weapon"),
		timeId: state.settings.timeOfDayEnabled ? namedId(state, pick.timeId, "time") : undefined
	};
	const prev = state.suggesting;
	if (prev && prev.playerId === next.playerId && prev.suspectId === next.suspectId && prev.roomId === next.roomId && prev.weaponId === next.weaponId && prev.timeId === next.timeId) return state;
	return { ...state, suggesting: next };
}
/** Solve the Case is open in the action phase, and on the digital board also while a guest still has steps left to walk (for example from inside a room). */
export function accuseOpen(state: GameState): boolean {
	return state.phase === "action" || (state.phase === "move" && state.settings?.table === "board");
}
export function makeAccusation(state: GameState, playerId: string, pick, secrets: Secrets): { state: GameState; secrets: Secrets } {
	const held = { state, secrets };
	if (!accuseOpen(state)) return held;
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
	// A wrong Solve the Case always eliminates. The rule used to read the raw setting, so a table
	// whose saved settings predate the flag (undefined) silently skipped the elimination.
	const eliminates = state.settings.wrongAccusationEliminates !== false;
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
		players: state.players.map((p) => p.id === subject && eliminates ? {
			...p,
			eliminated: true
		} : p)
	};
	if (eliminates) {
		next = {
			...next,
			influences: (next.influences ?? []).filter((i) => i.controllerId !== subject),
			spy: next.spy && next.spy.byId === subject ? null : next.spy
		};
	}
	let nextSecrets = secrets;
	if (eliminates) {
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
	let speedBoost = state.speedBoost ?? null;
	if (speedBoost && finished && speedBoost.playerId === finished.id) {
		speedBoost = speedBoost.turns > 1 ? { ...speedBoost, turns: speedBoost.turns - 1 } : null;
	}
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
		const extra = guide ? ` ${guideName} plays this turn, but may not Solve the Case.` : "";
		let spy = state.spy ?? null;
		if (spy && finished && spy.byId === finished.id && !spy.armed) spy = { ...spy, armed: true };
		if (spy?.armed && pid === spy.byId) spy = null;
		const idx = state.turnOrder.indexOf(pid);
		return log({
			...state,
			spy,
			notesLock,
			speedBoost,
			influences,
			skipIds,
			turnIndex: idx < 0 ? 0 : idx,
			phase: "roll",
			dice: null,
			pace: null,
			singleDie: false,
			extraDie: null,
			gambler: null,
			bonusRoom: null,
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
		// Coming back around to the guest who just played is only skipped when nobody was clunked.
		// If every other guest lost the turn, the same guest plays again.
		if (pid === finished?.id && order.length > 1 && !skipped.length) continue;
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
	return { ...state, notesLock, speedBoost, influences, skipIds, phase: "roll", dice: null, actionsLeft: 0, question: null, event: null, notice: null, noticeSelf: null, noticeFor: null };
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
	// Once the answers are sealed the game is under way. It is never dealt over again, whatever the hands look like.
	if (secrets?.envelope && Object.keys(secrets.envelope).length) return false;
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
	const solution = { ...(secrets?.envelope ?? secrets?.solution ?? {}) };
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
	// Extra Difficulty: the NPC is dealt a hand like everyone else, but it is never a seat at the table.
	const seats = players.map((player) => player.id);
	if (npcOn(state)) {
		hands[NPC_ID] = [];
		seats.push(NPC_ID);
	}
	const size = Math.floor(pool.length / seats.length);
	let leftover = pool.slice(size * seats.length);
	for (let i = 0; i < size * seats.length; i++) hands[seats[i % seats.length]].push(pool[i]);
	// Extra Difficulty: the NPC also takes the Table cards, even if that gives it more cards than anyone else.
	// Nothing is left face up on the table.
	if (npcOn(state) && leftover.length) {
		hands[NPC_ID] = [...hands[NPC_ID], ...leftover];
		leftover = [];
	}
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
	const seats = players.map((player) => player.id);
	if (npcOn(state)) seats.push(NPC_ID);
	const pool = deck.filter((card) => !answers.has(card.id)).length;
	const size = Math.floor(pool / seats.length);
	const extra = pool % seats.length;
	if (npcOn(state)) {
		// The NPC holds the Table cards too, so the table itself is empty and the NPC has the extras.
		if ((state.leftover ?? []).length !== 0) return false;
		return seats.every((id) => (secrets.hands?.[id] ?? []).length === (id === NPC_ID ? size + extra : size));
	}
	if ((state.leftover ?? []).length !== extra) return false;
	return seats.every((id) => (secrets.hands?.[id] ?? []).length === size);
}
export function ensureObjective(state, secrets) {
	if (!state?.startedAt) return { state, secrets };
	const sealed = sealAnswers(state, secrets);
	if (openingDeal(sealed.state, sealed.secrets)) {
		if (dealIsEven(sealed.state, sealed.secrets)) return sealed;
		return splitEven(sealed.state, sealed.secrets);
	}
	return reconcileCards(sealed.state, sealed.secrets);
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
	const envelope = secrets?.envelope && Object.keys(secrets.envelope).length ? secrets.envelope : null;
	const held = new Set<string>();
	for (const pile of Object.values(secrets?.hands ?? {})) {
		if (!Array.isArray(pile)) continue;
		for (const id of pile) held.add(String(id));
	}
	if (envelope) {
		// The answers were sealed at the deal. Whatever happened since (a player leaving, a sync, a rejoin),
		// they are put straight back. A card that strayed into a hand is taken out of the hand instead.
		for (const cat of cats) {
			const sealed = envelope[cat] ? String(envelope[cat]) : "";
			if (!sealed) continue;
			if (String(solution[cat] ?? "") !== sealed) {
				solution[cat] = sealed;
				changed = true;
			}
		}
	} else {
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
	// Once the cards are dealt and every group has its answer, the envelope is locked for good.
	let nextEnvelope = secrets?.envelope;
	const dealt = Object.values(hands).some((pile) => Array.isArray(pile) && pile.length > 0);
	if (!envelope && dealt) {
		const full = cats.every((cat) => !deck.some((card) => card.category === cat) || Boolean(solution[cat]));
		if (full) {
			nextEnvelope = { ...solution };
			changed = true;
		}
	}
	const reveals = [];
	if ((secrets?.reveals ?? []).length) changed = true;
	if (!changed) return { state, secrets };
	return {
		state: { ...state, leftover },
		secrets: { ...secrets, solution, hands: nextHands, reveals, ...(nextEnvelope ? { envelope: nextEnvelope } : {}) }
	};
}
/**
 * Every card that is not an answer is in exactly one place: one player's hand, the NPC's hand, or face up on
 * the table. If a card has gone missing (for example a leaving player's cards were lost), it would look like
 * "nobody holds this", and a journal would mark it as an answer. So any card that is nowhere is dealt back to a
 * player, and any card in two places or in a hand that no longer exists is fixed.
 */
function reconcileCards(state, secrets) {
	if (!state?.startedAt || state.phase === "lobby") return { state, secrets };
	const hands = secrets?.hands ?? {};
	const dealt = Object.values(hands).some((pile) => Array.isArray(pile) && pile.length > 0) || Boolean(secrets?.envelope && Object.keys(secrets.envelope).length);
	if (!dealt) return { state, secrets };
	const cats = activeCats(state);
	const deck = (state.cards ?? []).filter((card) => cats.includes(card.category));
	const deckIds = new Set(deck.map((card) => String(card.id)));
	const answers = answerSet(state, secrets);
	const owners = new Set((state.players ?? []).map((player) => player.id));
	if (npcOn(state)) owners.add(NPC_ID);
	const seen = new Set<string>();
	const orphans: string[] = [];
	const nextHands = {};
	let changed = false;
	for (const [id, pile] of Object.entries(hands)) {
		const clean: string[] = [];
		for (const raw of Array.isArray(pile) ? pile : []) {
			const cardId = String(raw);
			if (!cardId || !deckIds.has(cardId) || answers.has(cardId) || seen.has(cardId)) {
				changed = true;
				continue;
			}
			seen.add(cardId);
			if (owners.has(id)) clean.push(cardId);
			else {
				orphans.push(cardId);
				changed = true;
			}
		}
		if (owners.has(id)) nextHands[id] = clean;
		else changed = true;
	}
	for (const player of state.players ?? []) nextHands[player.id] ??= [];
	const leftover: string[] = [];
	for (const raw of state.leftover ?? []) {
		const cardId = String(raw);
		if (!cardId || !deckIds.has(cardId) || answers.has(cardId) || seen.has(cardId)) {
			changed = true;
			continue;
		}
		seen.add(cardId);
		leftover.push(cardId);
	}
	const missing = deck.map((card) => String(card.id)).filter((cardId) => !answers.has(cardId) && !seen.has(cardId));
	const give = [...orphans, ...missing];
	if (give.length) {
		changed = true;
		const live = (state.players ?? []).filter((player) => !player.eliminated).map((player) => player.id);
		const takers = live.length ? live : (state.players ?? []).map((player) => player.id);
		if (takers.length) {
			for (const cardId of fisherYates(give)) {
				const who = [...takers].sort((a, b) => (nextHands[a]?.length ?? 0) - (nextHands[b]?.length ?? 0))[0];
				nextHands[who] = [...(nextHands[who] ?? []), cardId];
			}
		} else {
			leftover.push(...give);
		}
	}
	if (!changed) return { state, secrets };
	return {
		state: { ...state, leftover },
		secrets: { ...secrets, hands: nextHands }
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
			// The leaving player's cards were just dealt to the others. Anyone who now holds a named card
			// and was already passed over is asked again, so a card that is really held is never reported
			// as "nobody has it" (that would make a journal mark it as an answer).
			let rewind = false;
			if (!q.shownCardId && !q.resolved && !q.closeTurn) {
				const want = new Set(askedIds(next.question));
				const holders = next.question.responderIds.filter((id) => cardsHeldBy(secretsNext, id).some((cardId) => want.has(cardId)));
				const early = holders.length ? Math.min(...holders.map((id) => next.question.responderIds.indexOf(id))) : -1;
				if (holders.length && early >= 0 && (early < next.question.cursor || holders.some((id) => next.question.skips.includes(id)))) {
					rewind = true;
					next = {
						...next,
						question: {
							...next.question,
							cursor: Math.min(next.question.cursor, early),
							skips: next.question.skips.filter((id) => !holders.includes(id)),
							missId: null
						}
					};
				}
			}
			if (q.spoken) {
				if (q.askingId === playerId || q.showerId === playerId || rewind) next = advanceSpoken(next, secretsNext);
			} else if (q.missId === playerId || q.showerId === playerId || rewind) {
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
			extraDie: null,
			gambler: null,
			bonusRoom: null,
			moveBudget: 0,
			actionsLeft: 0,
			freeQuestion: true,
			whisperMode: false,
			event: null,
			accusation: null
		};
	}
	next = log(next, `${player.name} left the table. Their turn is skipped and their cards go to the other players.${nextHost ? ` ${nextHost.name} is the new host.` : ""}`);
	// A player leaving never changes the answers. Put them back exactly as they were sealed.
	const sealedAnswers = secrets.envelope ?? secrets.solution;
	secretsNext = { ...secretsNext, solution: { ...sealedAnswers }, ...(secrets.envelope ? { envelope: secrets.envelope } : {}) };
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
