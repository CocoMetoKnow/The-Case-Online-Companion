// @ts-nocheck
import type { CardDef, CategoryId, EventKind } from "./types";

/** The host cannot turn a category below this many cards, and the case is drawn only from the cards left on. */
export const MIN_CATEGORY_CARDS = 4;
/** One answer is set aside in each group. Time adds the fourth. */
export function answerCards(time: boolean) {
	return time ? 4 : 3;
}

export const DEFAULT_CARDS: CardDef[] = [
	{
		id: "lord-harrington",
		category: "suspect",
		name: "Lord Harrington",
		blurb: "The host of the evening, impeccably dressed and oddly calm.",
		icon: "Crown"
	},
	{
		id: "lady-violet",
		category: "suspect",
		name: "Lady Violet",
		blurb: "A composer with a sharp ear for secrets.",
		icon: "Flower2"
	},
	{
		id: "dr-finch",
		category: "suspect",
		name: "Dr. Bunny",
		blurb: "The family physician, never without his bag. Or the rabbit inside it.",
		icon: "Stethoscope"
	},
	{
		id: "chef-marco",
		category: "suspect",
		name: "Chef Marco",
		blurb: "Pride of the kitchen, temper of a storm.",
		icon: "CookingPot"
	},
	{
		id: "miss-scarlet",
		category: "suspect",
		name: "Miss Crimson",
		blurb: "A guest who arrives in a red cloak and leaves before the last song.",
		icon: "Sparkles"
	},
	{
		id: "colonel-mustard",
		category: "suspect",
		name: "Colonel Flintwood",
		blurb: "Retired, decorated, and never late to dinner.",
		icon: "Medal"
	},
	{
		id: "professor-plum",
		category: "suspect",
		name: "Professor Quill",
		blurb: "A scholar of locked rooms and lost letters.",
		icon: "GraduationCap"
	},
	{
		id: "mrs-peacock",
		category: "suspect",
		name: "Mrs. Pearl",
		blurb: "A favorite at every supper, and nobody's fool.",
		icon: "Fan"
	},
	{
		id: "the-butler",
		category: "suspect",
		name: "Mr. Take",
		blurb: "Velvet coat, gloved hands, and a smile that gives nothing away.",
		icon: "UserRound"
	},
	{
		id: "observatory",
		category: "room",
		name: "Observatory",
		blurb: "A glass dome and a view of the storm.",
		icon: "Telescope"
	},
	{
		id: "grand-hall",
		category: "room",
		name: "Hall",
		blurb: "Portraits watch from the staircase.",
		icon: "Castle"
	},
	{
		id: "lounge",
		category: "room",
		name: "Lounge",
		blurb: "Velvet chairs and a dying fire.",
		icon: "Sofa"
	},
	{
		id: "library",
		category: "room",
		name: "Library",
		blurb: "Dust, indices, and a missing volume.",
		icon: "Library"
	},
	{
		id: "study",
		category: "room",
		name: "Study",
		blurb: "A locked drawer and a cold lamp.",
		icon: "Lamp"
	},
	{
		id: "dining-room",
		category: "room",
		name: "Dining Room",
		blurb: "The places were set. One chair is empty.",
		icon: "UtensilsCrossed"
	},
	{
		id: "conservatory",
		category: "room",
		name: "Conservatory",
		blurb: "Rain on glass, ferns in the dark.",
		icon: "TreeDeciduous"
	},
	{
		id: "billiard-room",
		category: "room",
		name: "Billiard Room",
		blurb: "Cue chalk and a conversation cut short.",
		icon: "Circle"
	},
	{
		id: "kitchen",
		category: "room",
		name: "Kitchen",
		blurb: "Copper pans, and a kettle left screaming.",
		icon: "CookingPot"
	},
	{
		id: "cellar",
		category: "room",
		name: "Cellar",
		blurb: "Stone, bottles, and a second staircase.",
		icon: "Warehouse"
	},
	{
		id: "ballroom",
		category: "room",
		name: "Ballroom",
		blurb: "The orchestra packed up before midnight.",
		icon: "Music"
	},
	{
		id: "candlestick",
		category: "weapon",
		name: "Candlestick",
		blurb: "Still warm. The wax has run.",
		icon: "Flame"
	},
	{
		id: "rope",
		category: "weapon",
		name: "Rope",
		blurb: "A length of curtain cord, newly cut.",
		icon: "Spline"
	},
	{
		id: "lead-pipe",
		category: "weapon",
		name: "Steel Pipe",
		blurb: "A heavy bar from the old west wing.",
		icon: "Pipette"
	},
	{
		id: "revolver",
		category: "weapon",
		name: "Revolver",
		blurb: "Unloaded now. Recently polished.",
		icon: "CircleDot"
	},
	{
		id: "knife",
		category: "weapon",
		name: "Knife",
		blurb: "A carving knife from the service tray.",
		icon: "Sword"
	},
	{
		id: "wrench",
		category: "weapon",
		name: "Wrench",
		blurb: "Heavy, oiled, out of the tool chest.",
		icon: "Wrench"
	},
	{
		id: "poison-bottle",
		category: "weapon",
		name: "Poison Bottle",
		blurb: "A chemist’s vial with a cracked seal.",
		icon: "FlaskConical"
	},
	{
		id: "fireplace-poker",
		category: "weapon",
		name: "Fireplace Poker",
		blurb: "Black iron, still smelling of smoke.",
		icon: "FlameKindling"
	},
	{
		id: "heavy-bookend",
		category: "weapon",
		name: "Heavy Bookend",
		blurb: "A bronze stag, far too weighty.",
		icon: "BookMarked"
	},
	{
		id: "time-dawn",
		category: "time",
		name: "Dawn",
		clock: "5:00",
		blurb: "First light on the drive. A songbird on the lamp.",
		icon: "Moon"
	},
	{
		id: "time-breakfast",
		category: "time",
		name: "Breakfast",
		clock: "8:00",
		blurb: "The house is awake. A robin in the hedge.",
		icon: "Moon"
	},
	{
		id: "time-late-morning",
		category: "time",
		name: "Late Morning",
		clock: "11:00",
		blurb: "High sun. Swallows over the roof.",
		icon: "Moon"
	},
	{
		id: "time-lunch",
		category: "time",
		name: "Lunch",
		clock: "1:00",
		blurb: "Noon on the cobbles. A dove in the drive.",
		icon: "Moon"
	},
	{
		id: "time-early-afternoon",
		category: "time",
		name: "Early Afternoon",
		clock: "3:00",
		blurb: "Warm light and a butterfly by the door.",
		icon: "Moon"
	},
	{
		id: "time-teatime",
		category: "time",
		name: "Tea Time",
		clock: "4:00",
		blurb: "Honey light. A bird on the garden wall.",
		icon: "Moon"
	},
	{
		id: "time-dusk",
		category: "time",
		name: "Dusk",
		clock: "6:00",
		blurb: "The sky goes copper. A bat leaves the eaves.",
		icon: "Moon"
	},
	{
		id: "time-dinner",
		category: "time",
		name: "Dinner",
		clock: "8:00",
		blurb: "Twilight. The windows are lit.",
		icon: "Moon"
	},
	{
		id: "time-night",
		category: "time",
		name: "Night",
		clock: "10:00",
		blurb: "A crescent moon. One bat crosses it.",
		icon: "Moon"
	},
	{
		id: "time-midnight",
		category: "time",
		name: "Midnight",
		clock: "12:00",
		blurb: "Full moon, an owl, and bats over the roof.",
		icon: "Moon"
	}
];
export const PHYSICAL_EVENTS = [
	"new-passage",
	"extra-roll",
	"fast-track",
	"shortcut",
	"move-anywhere",
	"second-wind",
	"wrong-turn",
	"send-home",
	"peek",
	"rumor",
	"call-card",
	"name-suspect",
	"name-weapon",
	"name-room",
	"name-time",
	"spy",
	"clunk",
	"food-poisoning",
	"blocked-out",
	"come-here",
	"that-noise",
	"swap-card",
	"thief",
	"about-face",
	"stealth-reveal",
	"sabotage",
	"wild-card",
	"influenced",
	"trade-places",
	"hush",
	"pass-card",
	"free-question",
	"lost-in-hall",
	"red-herring"
];
/** Powers that need a third guest. A two-player table never draws them. */
export const EVENT_MIN_PLAYERS = { "red-herring": 3 };
export function eventsForPlayers(count, settings?: { timeOfDayEnabled?: boolean; speakMode?: boolean; enabledEvents?: EventKind[] }) {
	return PHYSICAL_EVENTS.filter((kind) => {
		if ((EVENT_MIN_PLAYERS[kind] ?? 2) > count) return false;
		if (kind === "name-time" && !settings?.timeOfDayEnabled) return false;
		// A hushed card only works when the game knows which cards were asked.
		if (kind === "hush" && (settings as { speakMode?: boolean } | undefined)?.speakMode) return false;
		const enabled = settings?.enabledEvents?.map((id) => (id === "show-one" ? "hush" : id));
		if (enabled && !enabled.includes(kind)) return false;
		return true;
	});
}
const EXTRA_ART = new Set([
	"mr-green",
	"mrs-white",
	"mr-broke",
	"madame-coral",
	"the-chauffeur",
	"miss-penny",
	"oakley-autumns",
	"mr-fairwind",
	"ki-annie",
	"walking-cane",
	"golf-club",
	"horseshoe",
	"trophy-cup",
	"silk-scarf",
	"catacombs",
	"smugglers-tunnel",
	"boiler-room",
	"the-vault",
]);
const RETOUCHED_ART = new Set([
	"mr-green",
	"madame-coral",
	"mr-broke",
	"mrs-peacock",
	"heavy-bookend",
	"candlestick",
	"lead-pipe",
	"revolver",
	"knife",
	"wrench",
	"poison-bottle",
	"fireplace-poker",
	"walking-cane",
	"golf-club",
	"horseshoe",
]);
export function defaultCardArt(id: string): string | undefined {
	if (EXTRA_ART.has(id) || DEFAULT_CARDS.some((card) => card.id === id)) {
		const v = id.startsWith("time-")
			? 5
			: id === "the-butler" || id === "dr-finch"
				? 13
			: id === "lead-pipe" || id === "candlestick"
				? 11
				: id === "poison-bottle" || id === "fireplace-poker" || id === "knife"
					? 9
					: RETOUCHED_ART.has(id)
						? 7
						: 3;
		return `/cards/${id}.jpg?v=${v}`;
	}
}
/** Six original guests for a first evening. Hosts can rename every card and add a photo. */
export const CLASSIC_CARDS: CardDef[] = [
	{
		id: "miss-scarlet",
		category: "suspect",
		name: "Miss Crimson",
		blurb: "A guest who arrives in a red cloak and leaves before the last song.",
		icon: "Sparkles"
	},
	{
		id: "colonel-mustard",
		category: "suspect",
		name: "Colonel Flintwood",
		blurb: "Retired, decorated, and never late to dinner.",
		icon: "Medal"
	},
	{
		id: "mrs-white",
		category: "suspect",
		name: "Mrs. Snow",
		blurb: "She knows every cupboard in the house.",
		icon: "UserRound"
	},
	{
		id: "mr-green",
		category: "suspect",
		name: "Mr. Olive",
		blurb: "A neighbor with a spare key.",
		icon: "UserRound"
	},
	{
		id: "mrs-peacock",
		category: "suspect",
		name: "Mrs. Pearl",
		blurb: "A favorite at every supper, and nobody's fool.",
		icon: "Fan"
	},
	{
		id: "professor-plum",
		category: "suspect",
		name: "Professor Quill",
		blurb: "A scholar of locked rooms and lost letters.",
		icon: "GraduationCap"
	},
	{
		id: "study",
		category: "room",
		name: "Study",
		blurb: "A locked drawer and a cold lamp.",
		icon: "Lamp"
	},
	{
		id: "grand-hall",
		category: "room",
		name: "Hall",
		blurb: "Portraits along the stair.",
		icon: "Castle"
	},
	{
		id: "lounge",
		category: "room",
		name: "Lounge",
		blurb: "Velvet chairs and a dying fire.",
		icon: "Sofa"
	},
	{
		id: "library",
		category: "room",
		name: "Library",
		blurb: "Dust and a missing volume.",
		icon: "Library"
	},
	{
		id: "billiard-room",
		category: "room",
		name: "Billiard Room",
		blurb: "Cue chalk on the felt.",
		icon: "Circle"
	},
	{
		id: "dining-room",
		category: "room",
		name: "Dining Room",
		blurb: "One chair is empty.",
		icon: "UtensilsCrossed"
	},
	{
		id: "conservatory",
		category: "room",
		name: "Conservatory",
		blurb: "Rain on the glass.",
		icon: "TreeDeciduous"
	},
	{
		id: "ballroom",
		category: "room",
		name: "Ballroom",
		blurb: "The floor still holds the last dance.",
		icon: "Music"
	},
	{
		id: "kitchen",
		category: "room",
		name: "Kitchen",
		blurb: "Copper pans, kettle still hot.",
		icon: "CookingPot"
	},
	{
		id: "candlestick",
		category: "weapon",
		name: "Candlestick",
		blurb: "The wax has run.",
		icon: "Flame"
	},
	{
		id: "knife",
		category: "weapon",
		name: "Knife",
		blurb: "From the service tray.",
		icon: "Sword"
	},
	{
		id: "lead-pipe",
		category: "weapon",
		name: "Steel Pipe",
		blurb: "A heavy bar from the old plumbing.",
		icon: "Pipette"
	},
	{
		id: "revolver",
		category: "weapon",
		name: "Revolver",
		blurb: "Unloaded now.",
		icon: "CircleDot"
	},
	{
		id: "rope",
		category: "weapon",
		name: "Rope",
		blurb: "A length of curtain cord.",
		icon: "Spline"
	},
	{
		id: "wrench",
		category: "weapon",
		name: "Wrench",
		blurb: "Heavy, out of the tool chest.",
		icon: "Wrench"
	}
];
export const EVENT_DEFS = [
	{
		kind: "new-passage",
		title: "What's this doing here?",
		description: "Connect two rooms with a new secret passage. Moving through it costs 1 step."
	},
	{
		kind: "extra-roll",
		title: "Bonus Roll",
		description: "Add another pair of dice to your current roll and move the combined total."
	},
	{
		kind: "fast-track",
		title: "Fast Track",
		description: "Move directly to an adjacent room without rolling."
	},
	{
		kind: "shortcut",
		title: "Shortcut",
		description: "Use any secret passage right away, no matter where you are."
	},
	{
		kind: "move-anywhere",
		title: "Teleport",
		description: "Jump to any room on the board."
	},
	{
		kind: "second-wind",
		title: "Speed Boost",
		description: "Double your movement points for this turn only."
	},
	{
		kind: "wrong-turn",
		title: "Wrong Turn",
		description: "A random player's piece is dropped into a random room. Your turn continues."
	},
	{
		kind: "send-home",
		title: "Back to the Start",
		description: "Send all other players back to their starting squares. Your turn continues."
	},
	{
		kind: "peek",
		title: "Peek",
		description: "Look at a random card in an opponent's hand."
	},
	{
		kind: "rumor",
		title: "Tip-Off",
		description: "Get an anonymous hint about one part of the case."
	},
	{
		kind: "call-card",
		title: "Call the Card",
		description: "Name any specific card. The holder must show it to everyone (or announce if no one has it). Your turn continues."
	},
	{
		kind: "name-suspect",
		title: "Name a Character",
		description: "Name a specific character card. The holder must reveal it (or announce if no one has it). Your turn continues."
	},
	{
		kind: "name-weapon",
		title: "Name an Item",
		description: "Name a specific item card. The holder must reveal it (or announce if no one has it). Your turn continues."
	},
	{
		kind: "name-room",
		title: "Name a Room",
		description: "Name a specific room card. The holder must reveal it (or announce if no one has it). Your turn continues."
	},
	{
		kind: "name-time",
		title: "Name an Hour",
		description: "Name a specific hour card. The holder must reveal it (or announce if no one has it). Your turn continues."
	},
	{
		kind: "spy",
		title: "Spy",
		description: "Secretly see any cards shown to a specific player until your next turn."
	},
	{
		kind: "clunk",
		title: "Clunk",
		description: "Pick a player to skip their next turn."
	},
	{
		kind: "food-poisoning",
		title: "Food Poisoning",
		description: "Pick a player. Their detective notes stay closed for their next turn."
	},
	{
		kind: "blocked-out",
		title: "Blocked Out",
		description: "Pick a player. Their detective notes show as question marks for their next 2 turns."
	},
	{
		kind: "come-here",
		title: "Hey, come here!",
		description: "Move another player's piece into a room of your choice. Your turn continues."
	},
	{
		kind: "that-noise",
		title: "What was that noise!?",
		description: "Move every player's piece into one room."
	},
	{
		kind: "swap-card",
		title: "Swap a Card",
		description: "Trade one card with another player. Everyone knows a swap happened. Your turn continues."
	},
	{
		kind: "thief",
		title: "Thief",
		description: "Steal a die from another player for this turn only (you roll 3 dice; they roll 1 next turn)."
	},
	{
		kind: "about-face",
		title: "About Face",
		description: "Reverse the turn order for the rest of the game."
	},
	{
		kind: "stealth-reveal",
		title: "Stealth Auto-Reveal",
		description: "If a player holds a requested card, it is sent automatically and secretly, without revealing who sent it."
	},
	{
		kind: "sabotage",
		title: "Sabotage",
		description: "Block an opponent's next power-up."
	},
	{
		kind: "wild-card",
		title: "Wild Card",
		description: "Acts as a substitute for any standard power-up effect."
	},
	{
		kind: "influenced",
		title: "Influenced",
		description: "Control another player's next turn (move and answer for them), but you cannot see their hand or solve the case for them."
	},
	{
		kind: "trade-places",
		title: "Trade Places",
		description: "Swap spots on the board with another player."
	},
	{
		kind: "hush",
		title: "Hush",
		description: "Hide a card. The next time someone asks for it, the table is alerted."
	},
	{
		kind: "pass-card",
		title: "Pass to the Left",
		description: "Everyone passes one card from their hand to the player on their left."
	},
	{
		kind: "free-question",
		title: "A Bold Inquiry",
		description: "You can ask a question this turn even while standing in the hall."
	},
	{
		kind: "lost-in-hall",
		title: "Lost in the Hall",
		description: "Your piece is sent back out into the hall."
	},
	{
		kind: "red-herring",
		title: "Red Herring",
		description: "Two other players get private whispers about the case: one true, one false (anonymous). Needs 3+ players."
	}
];
export function cardsByCategory(cards: CardDef[], category: CategoryId): CardDef[] {
	return cards.filter((c) => c.category === category);
}

const OLD_TIME_IDS = new Set([
	"time-8pm",
	"time-9pm",
	"time-10pm",
	"time-11pm",
	"time-1am",
	"time-2am",
]);

const RETIRED_NAMES: Record<string, { from: string[]; name: string; blurb: string }> = {
	"miss-scarlet": { from: ["Miss Scarlet", "Miss Vale"], name: "Miss Crimson", blurb: "A guest who arrives in a red cloak and leaves before the last song." },
	"colonel-mustard": { from: ["Colonel Mustard", "Major Holt", "Colonel Saffron", "Inspector Flintwood"], name: "Colonel Flintwood", blurb: "Retired, decorated, and never late to dinner." },
	"professor-plum": { from: ["Professor Plum", "Professor Ellis", "Professor Violet"], name: "Professor Quill", blurb: "A scholar of locked rooms and lost letters." },
	"mrs-peacock": { from: ["Mrs. Peacock", "Mrs Peacock", "Mrs. Lark", "Mrs. Pheasant"], name: "Mrs. Pearl", blurb: "A favorite at every supper, and nobody's fool." },
	"the-butler": { from: ["The Butler"], name: "Mr. Take", blurb: "Velvet coat, gloved hands, and a smile that gives nothing away." },
	"dr-finch": { from: ["Dr. Finch"], name: "Dr. Bunny", blurb: "The family physician, never without his bag. Or the rabbit inside it." },
	"mrs-white": { from: ["Mrs. White", "Mrs White", "Mrs. Hale", "Mrs. Ivory"], name: "Mrs. Snow", blurb: "She knows every cupboard in the house." },
	"mr-green": { from: ["Mr. Green", "Mr Green", "Mr. Pell"], name: "Mr. Olive", blurb: "A neighbor with a spare key." },
	"lead-pipe": { from: ["Lead Pipe", "Iron Bar"], name: "Steel Pipe", blurb: "A heavy bar from the old west wing." },
	lounge: { from: ["Living Room", "Parlor", "Salon"], name: "Lounge", blurb: "Velvet chairs and a dying fire." },
	conservatory: { from: ["Greenhouse", "Glass Garden"], name: "Conservatory", blurb: "Rain on glass, ferns in the dark." },
	"billiard-room": { from: ["Game Room", "Cue Room", "Pool Room"], name: "Billiard Room", blurb: "Cue chalk and a conversation cut short." },
	ballroom: { from: ["Ballroom", "Dance Hall", "Gala Hall"], name: "Ballroom", blurb: "The orchestra packed up before midnight." },
	study: { from: ["Den", "Writing Room"], name: "Study", blurb: "A locked drawer and a cold lamp." },
	"grand-hall": { from: ["Main Hall", "Grand Hall", "Stair Hall"], name: "Hall", blurb: "Portraits watch from the staircase." },
};

/** Drop borrowed names from an older deck. A host's own rename is left alone. */
export function retireBorrowedNames(cards: CardDef[]): CardDef[] {
	let changed = false;
	const next = cards.map((card) => {
		const retired = RETIRED_NAMES[card.id];
		if (!retired || !retired.from.includes(card.name)) return card;
		changed = true;
		return { ...card, name: retired.name, blurb: retired.blurb || card.blurb };
	});
	return changed ? next : cards;
}

/** Saved decks pick up the ten DVD hours: Dawn through Midnight. */
export function upgradeTimeCards(cards: CardDef[]): CardDef[] {
	const cleared = retireBorrowedNames(cards);
	const renamed = cleared.some((card) => card.id === "mr-fairwind" && card.name !== "Morgan Drake")
		? cleared.map((card) =>
				card.id === "mr-fairwind" ? { ...card, name: "Morgan Drake" } : card,
			)
		: cleared;
	const swapped = renamed.some((card) => card.id === "sir-oswald")
		? renamed.map((card) =>
				card.id === "sir-oswald"
					? {
							...card,
							id: "oakley-autumns",
							name: "Oakley Autumns",
							blurb: "The flower girl. She came in with daisies and left petals in the hall.",
							icon: "UserRound",
						}
					: card,
			)
		: renamed;
	const times = swapped.filter((card) => card.category === "time");
	if (!times.length) return swapped;
	const fresh = DEFAULT_CARDS.filter((card) => card.category === "time").map((card) => ({ ...card }));
	const freshById = new Map(fresh.map((card) => [card.id, card]));
	const onlyKnown = times.every((card) => OLD_TIME_IDS.has(card.id) || freshById.has(card.id));
	if (!onlyKnown) return swapped;
	const needsSwap = times.length !== fresh.length || times.some((card) => !freshById.has(card.id));
	if (needsSwap) return [...swapped.filter((card) => card.category !== "time"), ...fresh];
	let changed = false;
	const next = swapped.map((card) => {
		const base = freshById.get(card.id);
		if (!base) return card;
		if (card.name === base.name && card.clock === base.clock && card.blurb === base.blurb) return card;
		changed = true;
		return { ...card, name: base.name, clock: base.clock, blurb: base.blurb, icon: base.icon };
	});
	return changed ? next : swapped;
}

/** At most 15 characters can be in the deck at once. */
export function capCharacters(cards: CardDef[], max = 15): CardDef[] {
	let count = 0;
	let cut = false;
	const next: CardDef[] = [];
	for (const card of cards) {
		if (card.category === "suspect") {
			if (count >= max) {
				cut = true;
				continue;
			}
			count += 1;
		}
		next.push(card);
	}
	return cut ? next : cards;
}
export function sliceSet(source, counts, timeEnabled) {
	const out = [];
	[
		"suspect",
		"room",
		"weapon",
		"time"
	].forEach((cat) => {
		if (cat === "time" && !timeEnabled) return;
		out.push(...cardsByCategory(source, cat).slice(0, counts[cat]));
	});
	return out;
}

export const EXTRA_GUESTS: CardDef[] = [
	{ id: "mr-broke", category: "suspect", name: "Mr. Broke", blurb: "A quiet man in a black hat, hands always folded.", icon: "UserRound" },
	{ id: "madame-coral", category: "suspect", name: "Madame Coral", blurb: "She arrived late and left her gloves behind.", icon: "UserRound" },
	{ id: "the-chauffeur", category: "suspect", name: "The Chauffeur", blurb: "He knows which car never left the drive.", icon: "UserRound" },
	{ id: "miss-penny", category: "suspect", name: "Miss Penny", blurb: "The youngest guest, and the sharpest listener.", icon: "UserRound" },
	{ id: "oakley-autumns", category: "suspect", name: "Oakley Autumns", blurb: "The flower girl. She came in with daisies and left petals in the hall.", icon: "UserRound" },
	{ id: "mr-fairwind", category: "suspect", name: "Morgan Drake", blurb: "A smiling traveler in an olive coat. He says he only came for the supper.", icon: "UserRound" },
	{ id: "ki-annie", category: "suspect", name: "Ki Annie", blurb: "The artist. There is always a little paint on her sleeve.", icon: "UserRound" },
];

/** Opening Night, plus the late arrivals. The Take turns heist mode on with this deck. */
const TAKE_GUEST_IDS = ["the-chauffeur", "mr-broke", "oakley-autumns", "mr-fairwind", "madame-coral", "miss-penny", "ki-annie"];

export function takeDeck(): CardDef[] {
	const byId = new Map(EXTRA_GUESTS.map((card) => [card.id, card]));
	const guests = TAKE_GUEST_IDS.map((id) => byId.get(id)).filter((card): card is CardDef => Boolean(card));
	// Mr. Take is on from the start in this deck, since it is named after him.
	const mrTake = DEFAULT_CARDS.find((card) => card.id === "the-butler");
	return [...CLASSIC_CARDS.map((card) => ({ ...card })), ...(mrTake ? [{ ...mrTake }] : []), ...guests.map((card) => ({ ...card }))];
}

export const THIEF_ITEM: Record<string, { name: string; blurb: string }> = {
	candlestick: { name: "Candlestick", blurb: "Solid gold, taken from the mantel." },
	rope: { name: "Necklace", blurb: "The clasp was left. The pearls were not." },
	"lead-pipe": { name: "Painting", blurb: "A small landscape in a gold frame, gone from the hall." },
	revolver: { name: "Scarf", blurb: "Ivory silk, no longer on the chair." },
	knife: { name: "Crest Knife", blurb: "The crest is gone from the display." },
	wrench: { name: "Music Box", blurb: "The little box is gone from the study shelf." },
	"poison-bottle": { name: "Violin", blurb: "It no longer rests on the music stand." },
	"fireplace-poker": { name: "Diamond", blurb: "The big stone is gone from the drawing room." },
	"heavy-bookend": { name: "Stag", blurb: "The little statue no longer holds the books." },
	"walking-cane": { name: "Brooch", blurb: "It was pinned to a cushion by the door." },
	"golf-club": { name: "Watch", blurb: "The pocket watch is not on the desk." },
	horseshoe: { name: "Gold Coins", blurb: "A stack from the library drawer." },
	"trophy-cup": { name: "Silver Cup", blurb: "The engraving is the only thing left behind." },
	"silk-scarf": { name: "Donut", blurb: "Frosted, sprinkled, and no longer on the plate." },
};

export function cardArt(id: string, heist = false): string | undefined {
	if (heist && THIEF_ITEM[id]) return `/cards/heist/${id}.jpg?v=${id === "candlestick" ? 7 : 5}`;
	return defaultCardArt(id);
}

export function asHeist(cards: CardDef[]): CardDef[] {
	return cards.map((card) => {
		if (card.category !== "weapon") return card;
		const swap = THIEF_ITEM[card.id];
		if (swap) return { ...card, name: swap.name, blurb: swap.blurb };
		const name = card.name.replace(/^Stolen\s+/i, "");
		return { ...card, name: `Stolen ${name}`, blurb: card.blurb || "Taken from the house." };
	});
}

export const EXTRA_WEAPONS: CardDef[] = [
	{ id: "walking-cane", category: "weapon", name: "Walking Cane", blurb: "Brass handle, heavier than it looks.", icon: "Sword" },
	{ id: "golf-club", category: "weapon", name: "Golf Club", blurb: "Brought in from the bag by the door.", icon: "Sword" },
	{ id: "horseshoe", category: "weapon", name: "Horseshoe", blurb: "Cold iron from the stable wall.", icon: "Sword" },
	{ id: "trophy-cup", category: "weapon", name: "Trophy Cup", blurb: "Silver, and far too easy to lift.", icon: "Sword" },
	{ id: "silk-scarf", category: "weapon", name: "Silk Scarf", blurb: "Ivory silk, dropped on a chair.", icon: "Sword" },
];

/** Underground rooms. Turned on together, they become the secret passages. */
export const UNDERGROUND_ROOMS: CardDef[] = [
	{ id: "catacombs", category: "room", name: "Catacombs", blurb: "Stone arches under the west wing.", icon: "Castle" },
	{ id: "the-vault", category: "room", name: "The Vault", blurb: "A round iron door beneath the study.", icon: "Castle" },
	{ id: "smugglers-tunnel", category: "room", name: "Smuggler's Tunnel", blurb: "A brick run that leaves the grounds.", icon: "Castle" },
	{ id: "boiler-room", category: "room", name: "Boiler Room", blurb: "Pipes and heat under the kitchen.", icon: "Castle" },
];

export const UNDERGROUND_PASSAGES: { a: string; b: string }[] = [
	{ a: "catacombs", b: "the-vault" },
	{ a: "smugglers-tunnel", b: "boiler-room" },
];


/** Easter egg: typing "clue" in the lobby swaps these guests back to the original Clue names. */
export const CLASSIC_NAME_MAP: Record<string, string> = {
	"Miss Crimson": "Miss Scarlet",
	"Colonel Flintwood": "Colonel Mustard",
	"Mrs. Snow": "Mrs. White",
	"Mr. Olive": "Mr. Green",
	"Mrs. Pearl": "Mrs. Peacock",
	"Professor Quill": "Professor Plum",
};
const CLASSIC_NAME_BACK: Record<string, string> = Object.fromEntries(
	Object.entries(CLASSIC_NAME_MAP).map(([custom, classic]) => [classic, custom]),
);

/** The name to show for one character: the classic Clue name when the egg is on, otherwise as given. */
export function classicName(name: string, on: boolean): string {
	return on ? (CLASSIC_NAME_MAP[name] ?? name) : (CLASSIC_NAME_BACK[name] ?? name);
}

/** Swap suspect names to the classic Clue names (on) or back to the custom ones (off). A host's own renames are left alone. */
export function applyClassicNames(cards: CardDef[], on: boolean): CardDef[] {
	let changed = false;
	const next = cards.map((card) => {
		if (card.category !== "suspect") return card;
		const name = classicName(card.name, on);
		if (name === card.name) return card;
		changed = true;
		return { ...card, name };
	});
	return changed ? next : cards;
}

/**
 * Every character portrait in the game, whether or not that character is a card in this
 * deck. Profile pictures come from here, so nobody has to be a suspect card to be picked.
 */
export function allCharacters(): CardDef[] {
	const seen = new Set<string>();
	const out: CardDef[] = [];
	for (const card of [...DEFAULT_CARDS, ...CLASSIC_CARDS, ...EXTRA_GUESTS]) {
		if (card.category !== "suspect" || seen.has(card.id)) continue;
		seen.add(card.id);
		out.push({ ...card });
	}
	return retireBorrowedNames(out);
}

/**
 * The characters a guest can use as a profile picture: the whole catalog, with this
 * deck's own version of a card (renamed or custom photo) winning, then any custom
 * suspect the host added that is not in the catalog.
 */
export function avatarCharacters(deck: CardDef[] | undefined, classic = false): CardDef[] {
	const inDeck = new Map((deck ?? []).filter((card) => card.category === "suspect").map((card) => [card.id, card]));
	const out = allCharacters().map((card) => inDeck.get(card.id) ?? card);
	const known = new Set(out.map((card) => card.id));
	for (const card of inDeck.values()) if (!known.has(card.id)) out.push(card);
	return classic ? applyClassicNames(out, true) : out;
}
