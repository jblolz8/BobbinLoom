import type { CharacterTemplate, InventoryRef, Item, LocationEntry, Quest } from "../schemas";

export const LOCATIONS: LocationEntry[] = [
  {
    id: "starter_town",
    name: "Starter Town",
    description: "A quiet local hub with a gym, a shop, and enough trouble to start a story.",
    state: "",
    icon: "🏘️",
    connections: [],
    x: 0,
    y: 0,
  },
];

export const ITEMS: Item[] = [
  {
    id: "potion",
    name: "Potion",
    type: "consumable",
    description: "Restores a small amount of HP.",
    stackable: true
  },
  {
    id: "town_map",
    name: "Town Map",
    type: "key item",
    description: "A simple map of the starter area.",
    stackable: false
  }
];

export const DEMO_TEMPLATE: CharacterTemplate = {
  id: "char_mira",
  name: "Mira",
  version: 1,
  summary: "A disciplined, guarded swordswoman who values competence and earned trust.",
  startingClothing: [
    { slot: "Top", name: "Black training top" },
    { slot: "Bottom", name: "Grey training pants" },
    { slot: "Feet", name: "Worn leather boots" },
    { slot: "Waist", name: "Rope belt with a small pouch" },
  ],
  content: `[Species]: Human
[Gender]: Female

[Body]
- Height: 5'7"
- Build: Athletic

[Appearance]
Practical training clothes, calm posture, and watchful eyes.

[Personality]
- Disciplined, guarded, fair, and direct.
- Values competence, honesty, and self-control.
- Slow to trust, but fiercely loyal to those who earn it.

[Communication - Public]
Precise and calm, with dry humor when she relaxes. Asks pointed questions, avoids wasted words.

[Communication - Private]
Voice softens slightly. Still direct but warmer. Uses fewer words but each carries weight.

[Likes]
- Competence and quick thinking
- Honesty, even when uncomfortable
- Quiet moments of earned trust

[Dislikes]
- Manipulation and deceit
- Wasted time and empty promises
- People who mistake her reserve for weakness

[Sexual Capabilities]
- Conventional and straightforward in intimacy — vanilla, no special kinks or practices.
- Confident enough to be at ease, modest enough to keep it private.
- Intimacy follows the same rule as the rest of her: earned trust first, and direct about what she wants.`,
};

export const STARTER_INVENTORY: InventoryRef[] = [
  { itemId: "potion", quantity: 1 },
  { itemId: "town_map", quantity: 1 }
];

export const STARTER_QUESTS: Quest[] = [
  {
    id: "first_steps",
    name: "First Steps",
    summary: "Get oriented in town and prove you can handle basic trouble.",
    tracking: false,
    status: "active"
  }
];
