/**
 * Team Mode content pools. Pure data: every run draws a fresh subset of these, so adding more here
 * (a suspect, a room, a twist) automatically widens how many different cases the generator can build.
 */

export type CategoryKey = "suspect" | "room" | "weapon" | "motive" | "time";
export const CATEGORY_KEYS: CategoryKey[] = ["time", "room", "weapon", "suspect", "motive"];

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  time: "Time of the theft",
  room: "The scene",
  weapon: "Tool used",
  suspect: "Culprit",
  motive: "Motive",
};

export interface Item {
  id: string;
  name: string;
  /** A short emoji used on the map and the deduction board. */
  icon: string;
}

export const SUSPECT_POOL: Item[] = [
  { id: "lord-harrington", name: "Lord Harrington", icon: "👑" },
  { id: "dr-finch", name: "Dr. Bunny", icon: "🩺" },
  { id: "chef-marco", name: "Chef Marco", icon: "🍳" },
  { id: "miss-scarlet", name: "Miss Crimson", icon: "💃" },
  { id: "colonel-mustard", name: "Colonel Flintwood", icon: "🎖️" },
  { id: "professor-plum", name: "Professor Quill", icon: "🎓" },
  { id: "the-butler", name: "The Butler", icon: "🎩" },
  { id: "mr-broke", name: "Mr. Broke", icon: "🧢" },
  { id: "madame-coral", name: "Madame Coral", icon: "🧤" },
  { id: "the-chauffeur", name: "The Chauffeur", icon: "🚗" },
  { id: "miss-penny", name: "Miss Penny", icon: "🪙" },
  { id: "ki-annie", name: "Ki Annie", icon: "🎨" },
];

export const WEAPON_POOL: Item[] = [
  { id: "lockpick", name: "Lock Pick", icon: "🗝️" },
  { id: "hook", name: "Grappling Hook", icon: "🪝" },
  { id: "cart", name: "Laundry Cart", icon: "🛒" },
  { id: "rope", name: "Silk Rope", icon: "🪢" },
  { id: "fakekey", name: "Copied Key", icon: "🔑" },
  { id: "umbrella", name: "Trick Umbrella", icon: "☂️" },
  { id: "smoke", name: "Smoke Pellet", icon: "💨" },
  { id: "tray", name: "Silver Tray", icon: "🍽️" },
  { id: "trumpet", name: "Brass Trumpet", icon: "🎺" },
  { id: "cloak", name: "Velvet Cloak", icon: "🧥" },
];

export interface MotiveDef extends Item {
  /** Used in the ending: "...because {line}". */
  line: string;
}

export const MOTIVE_POOL: MotiveDef[] = [
  { id: "revenge", name: "A Grudge", icon: "😤", line: "an old quarrel had never been forgotten" },
  { id: "greed", name: "Greed", icon: "💰", line: "the treasure was worth a fortune and the chance was too good to pass up" },
  { id: "jealousy", name: "Jealousy", icon: "💚", line: "someone else had always had the thing they wanted most" },
  { id: "blackmail", name: "A Secret", icon: "📨", line: "a secret letter threatened an honest reputation" },
  { id: "inheritance", name: "Inheritance", icon: "📜", line: "the will was about to be rewritten" },
  { id: "cover-up", name: "A Cover-up", icon: "🗝️", line: "a mistake in the house could not be allowed to come out" },
  { id: "ambition", name: "Ambition", icon: "🪜", line: "the way to the top was blocked by one old treasure" },
  { id: "obsession", name: "Collecting", icon: "🖼️", line: "a collector could not bear to see it go to someone else" },
  { id: "betrayal", name: "A Broken Promise", icon: "🤝", line: "a trusted partner had gone back on a promise" },
  { id: "fear", name: "A Silly Dare", icon: "🎲", line: "a dare among friends had gone much too far" },
];

export const TIME_POOL: Item[] = [
  { id: "t6", name: "6:00 PM", icon: "🕕" },
  { id: "t7", name: "7:00 PM", icon: "🕖" },
  { id: "t8", name: "8:00 PM", icon: "🕗" },
  { id: "t9", name: "9:00 PM", icon: "🕘" },
  { id: "t10", name: "10:00 PM", icon: "🕙" },
  { id: "t11", name: "11:00 PM", icon: "🕚" },
];

/** What a player can interact with in a room. `kind` is the puzzle the object tends to hide. */
export interface RoomObject {
  id: string;
  name: string;
  kind: PuzzleKindId;
  /** "You {verb} the {name}." style flavor. */
  verb: string;
}

export type PuzzleKindId = "cipher" | "combo" | "order" | "sequence" | "anagram" | "fuse" | "memory" | "oddone" | "codebreaker" | "grid" | "whichbox" | "dash";

export interface RoomDef extends Item {
  objects: [RoomObject, RoomObject, RoomObject];
  /** Words (uppercase) the cipher and anagram puzzles hide in this room. */
  words: string[];
  /** Small scene nouns for the counting puzzle. */
  things: string[];
  /** What the room sounds or smells like. Mixed with the hour to make the room feel different through the night. */
  sense: string[];
}

export const ROOM_POOL: RoomDef[] = [
  {
    id: "library", name: "Library", icon: "📚",
    objects: [
      { id: "shelf", name: "tall bookshelf", kind: "combo", verb: "run your fingers along" },
      { id: "globe", name: "antique globe", kind: "cipher", verb: "spin" },
      { id: "desk", name: "writing desk", kind: "order", verb: "search" },
    ],
    words: ["FOLIO", "QUILL", "SPINE", "INKWELL", "VOLUME", "BOOKMARK", "ATLAS", "CHAPTER"],
    things: ["leather books", "scrolls", "bookmarks", "inkwells"],
    sense: ["the smell of old paper", "a ticking mantel clock", "the creak of a ladder", "dust floating in the air"],
  },
  {
    id: "conservatory", name: "Conservatory", icon: "🪴",
    objects: [
      { id: "fern", name: "overgrown fern", kind: "oddone", verb: "part" },
      { id: "fountain", name: "mossy fountain", kind: "sequence", verb: "peer into" },
      { id: "bench", name: "iron bench", kind: "anagram", verb: "check under" },
    ],
    words: ["ORCHID", "TRELLIS", "FERN", "BLOSSOM", "GARDEN", "PETAL", "LILY", "MOSS"],
    things: ["clay pots", "orchids", "watering cans", "glass panes"],
    sense: ["damp earth and jasmine", "rain tapping on glass", "dripping water", "the rustle of leaves"],
  },
  {
    id: "kitchen", name: "Kitchen", icon: "🍳",
    objects: [
      { id: "pantry", name: "locked pantry", kind: "combo", verb: "rattle" },
      { id: "stove", name: "cold stove", kind: "fuse", verb: "inspect" },
      { id: "rack", name: "utensil rack", kind: "oddone", verb: "count along" },
    ],
    words: ["LADLE", "COLANDER", "SIMMER", "PANTRY", "SKILLET", "SAFFRON", "WHISK", "COPPER"],
    things: ["copper pots", "ladles", "jars of spice", "plates"],
    sense: ["a faint smell of toasted sugar", "a dripping tap", "the hum of the icebox", "cold grease on the air"],
  },
  {
    id: "ballroom", name: "Ballroom", icon: "🪩",
    objects: [
      { id: "chandelier", name: "great chandelier", kind: "fuse", verb: "study" },
      { id: "piano", name: "grand piano", kind: "memory", verb: "touch the keys of" },
      { id: "stage", name: "little stage", kind: "order", verb: "look behind" },
    ],
    words: ["WALTZ", "CHANDELIER", "TANGO", "ENCORE", "BALCONY", "MINUET", "PARQUET", "GALA"],
    things: ["gilt chairs", "candles", "streamers", "mirrors"],
    sense: ["a long, empty echo", "the memory of music", "the sway of the chandelier", "polish and perfume"],
  },
  {
    id: "study", name: "Study", icon: "🕰️",
    objects: [
      { id: "safe", name: "wall safe", kind: "combo", verb: "feel the dial of" },
      { id: "clock", name: "grandfather clock", kind: "sequence", verb: "open the case of" },
      { id: "cabinet", name: "map cabinet", kind: "cipher", verb: "unroll" },
    ],
    words: ["LEDGER", "SEAL", "WAX", "CABINET", "MEMO", "CIPHER", "BLOTTER", "DOSSIER"],
    things: ["ledgers", "wax seals", "pens", "brass keys"],
    sense: ["pipe smoke that never left", "a slow, heavy tick", "the rasp of a stiff drawer", "cold leather"],
  },
  {
    id: "billiard", name: "Billiard Room", icon: "🎱",
    objects: [
      { id: "table", name: "billiard table", kind: "sequence", verb: "chalk a cue at" },
      { id: "rack2", name: "cue rack", kind: "oddone", verb: "check" },
      { id: "bar", name: "little bar", kind: "memory", verb: "line up the bottles on" },
    ],
    words: ["CUE", "CHALK", "BREAK", "POCKET", "FELT", "SNOOKER", "RACK", "BANK"],
    things: ["billiard balls", "cues", "bottles", "score pegs"],
    sense: ["chalk dust", "the click of settling balls", "the tang of whisky", "a draught under the door"],
  },
  {
    id: "dining", name: "Dining Room", icon: "🍽️",
    objects: [
      { id: "table2", name: "long dining table", kind: "order", verb: "walk the length of" },
      { id: "sideboard", name: "silver sideboard", kind: "combo", verb: "open" },
      { id: "plates", name: "wall of plates", kind: "anagram", verb: "read the plates on" },
    ],
    words: ["SUPPER", "TUREEN", "NAPKIN", "GOBLET", "CARAFE", "BANQUET", "SILVER", "COURSE"],
    things: ["place settings", "goblets", "candles", "napkins"],
    sense: ["cold gravy and wax", "a clink of glass", "the whisper of drapes", "an uneaten feast"],
  },
  {
    id: "lounge", name: "Lounge", icon: "🛋️",
    objects: [
      { id: "fireplace", name: "glowing fireplace", kind: "fuse", verb: "poke at" },
      { id: "sofa", name: "velvet sofa", kind: "oddone", verb: "feel between the cushions of" },
      { id: "radio", name: "wooden radio", kind: "cipher", verb: "tune" },
    ],
    words: ["CUSHION", "EMBER", "SHERRY", "RADIO", "TASSEL", "MANTEL", "VELVET", "HEARTH"],
    things: ["cushions", "glasses", "magazines", "photographs"],
    sense: ["woodsmoke and sherry", "static from a distant station", "the pop of fading embers", "a draught down the chimney"],
  },
  {
    id: "observatory", name: "Observatory", icon: "🔭",
    objects: [
      { id: "scope", name: "brass telescope", kind: "sequence", verb: "peer through" },
      { id: "charts", name: "star charts", kind: "memory", verb: "trace" },
      { id: "dome", name: "iron dome crank", kind: "fuse", verb: "turn" },
    ],
    words: ["ORBIT", "COMET", "ZENITH", "LUNAR", "NEBULA", "METEOR", "ECLIPSE", "STELLAR"],
    things: ["star charts", "lenses", "brass dials", "pins"],
    sense: ["freezing, thin air", "the groan of the dome", "wind rattling the shutters", "the glitter of far stars"],
  },
  {
    id: "cellar", name: "Wine Cellar", icon: "🍾",
    objects: [
      { id: "barrel", name: "oak barrel", kind: "combo", verb: "knock on" },
      { id: "rack3", name: "dusty wine rack", kind: "order", verb: "pull out a bottle from" },
      { id: "door", name: "iron grate", kind: "anagram", verb: "read the tag on" },
    ],
    words: ["VINTAGE", "CORK", "CLARET", "BARREL", "MAGNUM", "RESERVE", "SPIGOT", "CASK"],
    things: ["bottles", "barrels", "corks", "iron hooks"],
    sense: ["damp stone and wine", "a distant drip", "cold that seeps into your coat", "mouse feet in the dark"],
  },
  {
    id: "attic", name: "Attic", icon: "🧳",
    objects: [
      { id: "trunk", name: "steamer trunk", kind: "combo", verb: "pry open" },
      { id: "mirror", name: "shrouded mirror", kind: "memory", verb: "pull the sheet off" },
      { id: "doll", name: "porcelain doll", kind: "cipher", verb: "turn over" },
    ],
    words: ["TRUNK", "LOCKET", "RELIC", "COBWEB", "KEEPSAKE", "ATTIC", "LANTERN", "SHROUD"],
    things: ["trunks", "dolls", "picture frames", "hat boxes"],
    sense: ["old dust and mothballs", "scratching in the rafters", "a floorboard that settles by itself", "the groan of the roof"],
  },
  {
    id: "chapel", name: "Chapel", icon: "⛪",
    objects: [
      { id: "altar", name: "stone altar", kind: "order", verb: "kneel at" },
      { id: "organ", name: "pipe organ", kind: "sequence", verb: "press a key of" },
      { id: "window", name: "stained window", kind: "fuse", verb: "study" },
    ],
    words: ["PSALM", "HYMNAL", "VESTRY", "ALTAR", "CANDLE", "BELFRY", "PEW", "CENSER"],
    things: ["pews", "candles", "hymn books", "kneelers"],
    sense: ["incense gone cold", "a hush that feels heavy", "a distant bell", "the echo of your footsteps"],
  },
];

/** Danger zones: where lost evidence ends up, and where players get trapped when a recovery goes wrong. */
export interface ZoneDef extends Item {
  flavor: string;
}
export const ZONE_POOL: ZoneDef[] = [
  { id: "crypt", name: "The Old Vault", icon: "🏺", flavor: "Stone stairs lead down into a cool, dim vault. Something rattles below." },
  { id: "gallery", name: "Collapsed Gallery", icon: "🧱", flavor: "Beams dangle loose over a floor that is mostly gaps." },
  { id: "boiler", name: "Flooded Boiler Room", icon: "🌊", flavor: "Dark water laps at the pipes. The valves are all in the wrong order." },
  { id: "passage", name: "Servants' Passage", icon: "🚪", flavor: "A narrow way behind the walls. It was sealed up for a reason." },
  { id: "greenhouse", name: "Steamy Greenhouse", icon: "♨️", flavor: "Fog clouds the glass and the air is thick and hot." },
  { id: "tunnel", name: "Smugglers' Tunnel", icon: "🕳️", flavor: "A brick run that goes on much farther than the grounds." },
];

export const VICTIM_POOL: { name: string; role: string }[] = [
  { name: "Sir Reginald Ashcroft", role: "the retired shipping magnate" },
  { name: "Lady Octavia Wren", role: "the widowed art collector" },
  { name: "Mr. Alistair Crowe", role: "the family solicitor" },
  { name: "Dame Imogen Vale", role: "the celebrated opera singer" },
  { name: "Dr. Percival Moss", role: "the famous naturalist" },
  { name: "Mrs. Beatrix Holloway", role: "the formidable headmistress" },
  { name: "Lord Edmund Thorne", role: "the owner of the estate" },
  { name: "Miss Cordelia Finch", role: "the star of the society pages" },
];

export const TREASURE_POOL: string[] = [
  "the Harrington Diamond", "the Golden Violin", "the Emerald Crown", "the Royal Portrait",
  "the Silver Chalice", "the Ruby Locket", "the Jade Dragon", "the Pearl Necklace",
];

/** 12 settings x 9 twists = 108 distinct storylines (times 8 owners and 8 treasures), each independent of the hidden solution. */
export const PREMISES: { id: string; title: string; intro: string; epilogue: string }[] = [
  { id: "storm-dinner", title: "The Storm-Bound Dinner", intro: "A storm has cut the road. During dinner, {owner}, {role}, found that {treasure} had vanished from its case, and no one can leave Harrington Manor until dawn.", epilogue: "As the storm cleared, the dinner guests finally understood how the evening had really gone." },
  { id: "masquerade", title: "The Masquerade", intro: "At the masked ball every guest wore a disguise. When the music stopped, {owner}, {role}, discovered that {treasure} was gone.", epilogue: "When the last mask came off, the guest list finally made sense." },
  { id: "will", title: "The Reading of the Will", intro: "The family gathered to hear the will. Before the envelope could be opened, {owner}, {role}, found {treasure} missing.", epilogue: "The envelope, when opened, explained more than the family ever wanted to know." },
  { id: "gala", title: "The Charity Gala", intro: "The gala raised thousands before the lights flickered. When they came back on, {owner}, {role}, saw that {treasure} had vanished from the display.", epilogue: "The auction paddles were still raised when the truth came out." },
  { id: "hunt", title: "The Treasure Hunt Weekend", intro: "The weekend guests were out on a treasure hunt when {owner}, {role}, discovered that the real treasure, {treasure}, was missing.", epilogue: "The clues had been pointing at the answer all along." },
  { id: "magic", title: "The Magic Show", intro: "The magician bowed and the curtain fell. When it rose, {owner}, {role}, found that {treasure} had disappeared, and it was not part of the act.", epilogue: "It turned out the best trick of the night was not on the program." },
  { id: "anniversary", title: "The Anniversary Party", intro: "Fifty years of the house were being toasted. {owner}, {role}, raised a glass and noticed that {treasure} was gone from its place of honor.", epilogue: "The toast, it turned out, held the cleverest hint of the night." },
  { id: "chess", title: "The Chess Tournament", intro: "The final match was never played. {owner}, {role}, came to fetch {treasure} for the trophy table and found an empty case.", epilogue: "Every piece on that board had told you where to look." },
  { id: "opening", title: "Opening Night", intro: "The recital drew the whole county. During the interval, {owner}, {role}, learned that {treasure} was missing from the lobby.", epilogue: "The last note of the evening was the sound of the mystery being solved." },
  { id: "garden", title: "The Garden Party", intro: "Lanterns hung in the garden and everyone was dressed in their best. Then {owner}, {role}, found that {treasure} was gone from the glass cabinet.", epilogue: "The garden had been watching all along." },
  { id: "auction", title: "The Auction Preview", intro: "The estate's treasures stood under dust sheets. {owner}, {role}, lifted one to admire {treasure} and found only dust.", epilogue: "One of those lots was never meant to be sold at any price." },
  { id: "newyear", title: "New Year's Eve", intro: "At midnight the whole house counted down. In the dark that followed, {owner}, {role}, found that {treasure} had slipped away.", epilogue: "The countdown had been the only alibi anyone needed." },
];

export interface TwistDef {
  id: string;
  title: string;
  /** Appears on the case file. */
  teaser: string;
  /** Appears in the ending. */
  reveal: string;
  /** Gameplay modifiers. Defaults are in generator.ts. */
  mods: {
    darkBonus?: number; // extra puzzle level when the lights are out
    darkFrom?: number; // phase number (0-4) from which the lights are out; default 3
    menacePerPhase?: number; // alarm gained each time the night moves on
    lockedCount?: 1 | 2 | 3;
    startHints?: number;
    roundsPerPhase?: number;
    boonWeight?: number; // more helpful environment cards
    zonePenalty?: number; // extra alarm for failing in a danger zone
    startMenace?: number;
  };
}

export const TWISTS: TwistDef[] = [
  { id: "blackout", title: "Blackout Night", teaser: "The fuse box was sabotaged. The dark comes early.", reveal: "The blackout was no accident: it covered every step of the crime.", mods: { darkBonus: 1, darkFrom: 1 } },
  { id: "storm", title: "Rising Storm", teaser: "Each hour the storm grows worse, and so does the house.", reveal: "The storm gave the culprit the one thing they needed: no witnesses.", mods: { menacePerPhase: 1 } },
  { id: "lockdown", title: "Locked-Down House", teaser: "Three wings are sealed. Someone wanted them kept shut.", reveal: "The sealed wings held what the culprit could not afford to have found.", mods: { lockedCount: 3 } },
  { id: "saboteur", title: "The Saboteur", teaser: "Someone in the house is working against you. Hints are scarce.", reveal: "A second hand had been tampering with the evidence the whole time.", mods: { startHints: 1, startMenace: 1 } },
  { id: "loyal", title: "The Loyal Servant", teaser: "An old servant slips you what help they can.", reveal: "The servant had known more than they ever said, and said it just in time.", mods: { startHints: 5, boonWeight: 1.5 } },
  { id: "short-night", title: "A Short Night", teaser: "Dawn comes early. There is less time than you think.", reveal: "The culprit was counting on the sunrise to end the matter.", mods: { roundsPerPhase: 2, startHints: 4 } },
  { id: "creaky", title: "The Creaky Wing", teaser: "The old parts of the house are creakier and trickier than they should be.", reveal: "The creaky rooms were being watched by someone very ordinary.", mods: { zonePenalty: 1 } },
  { id: "open-house", title: "Open House", teaser: "The house is mostly unlocked, but the night is long and watchful.", reveal: "With every door open, the only secret left was the one in someone's head.", mods: { lockedCount: 1, startMenace: 1 } },
  { id: "double-cross", title: "The Double-Cross", teaser: "Allies are scarce and a few boons are worth more than gold.", reveal: "Nobody in that house was quite who they said they were.", mods: { boonWeight: 2, startHints: 2, menacePerPhase: 1 } },
];

/** The night. Each phase lasts a few rounds and changes the house: mood, difficulty and what the cards can do. */
export interface PhaseDef {
  id: string;
  clock: string;
  /** The hour used by cipher puzzles ("the clock chimes N times"). */
  hour: number;
  title: string;
  mood: string;
  /** Extra puzzle level this phase adds on top of the room's own difficulty. */
  levelBonus: number;
  /** Whether the lights are out (makes fuse and memory puzzles harder unless a lantern is used). */
  dark: boolean;
  /** Chance that an environment draw is a critical event. */
  critical: number;
}

export const PHASES: PhaseDef[] = [
  { id: "midnight", clock: "12:00 AM", hour: 12, title: "Midnight", mood: "The lamps glow low and the house holds its breath.", levelBonus: 0, dark: false, critical: 0 },
  { id: "one", clock: "1:00 AM", hour: 1, title: "The One O'Clock Chill", mood: "Cold draughts move through rooms with the doors shut.", levelBonus: 0, dark: false, critical: 0.05 },
  { id: "two", clock: "2:00 AM", hour: 2, title: "Fog at the Windows", mood: "Fog presses on the glass. The floorboards creak behind you.", levelBonus: 1, dark: false, critical: 0.1 },
  { id: "three", clock: "3:00 AM", hour: 3, title: "Deep of Night", mood: "The lights fail. You work by lantern and by touch.", levelBonus: 1, dark: true, critical: 0.16 },
  { id: "four", clock: "4:00 AM", hour: 4, title: "Before the Dawn", mood: "The last lamp dims. Everything feels strange at this hour, and the culprit is near.", levelBonus: 2, dark: true, critical: 0.22 },
];

/** Names for the detectives and their roles. */
export interface RoleDef {
  id: string;
  title: string;
  icon: string;
  blurb: string;
}
export const ROLES: RoleDef[] = [
  { id: "inspector", title: "Inspector", icon: "🔍", blurb: "Sees three cards when drafting instead of two." },
  { id: "medic", title: "Medic", icon: "🩹", blurb: "Rescues never backfire. A failed rescue does not trap the Medic." },
  { id: "locksmith", title: "Locksmith", icon: "🔑", blurb: "Gets two free hints on critical tasks and locks." },
  { id: "scout", title: "Scout", icon: "🧭", blurb: "The first move each turn is free." },
  { id: "archivist", title: "Archivist", icon: "🗂️", blurb: "Recovers two pieces of lost evidence and faces an easier recovery." },
  { id: "cryptographer", title: "Cryptographer", icon: "🔐", blurb: "Ciphers and anagrams come with a free hint." },
];

export const DEFAULT_NAMES = ["Alex", "Blair", "Casey", "Drew", "Emery", "Finley"];
