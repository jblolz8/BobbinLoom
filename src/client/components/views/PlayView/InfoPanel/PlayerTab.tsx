import type { InventoryRef, Item, Playthrough } from "../../../../../schemas";
import { ITEMS } from "../../../../../engine/demoData";

const ITEM_EMOJI: Record<string, string> = {
  consumable: "🧪",
  equipment: "⚔️",
  weapon: "⚔️",
  armor: "🛡️",
  key: "🔑",
  "key item": "🔑",
  tool: "🔧",
  misc: "📦"
};

function formatItemDisplay(ref: InventoryRef, catalog: Item[] | undefined): string {
  const def = catalog?.find((i) => i.id === ref.itemId) ?? ITEMS.find((i) => i.id === ref.itemId);
  const rawName = def?.name ?? ref.itemId;
  const emoji = ITEM_EMOJI[def?.type ?? "misc"] ?? "📦";
  const hasEmoji = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}]/u.test(rawName);
  const displayName = hasEmoji ? rawName : `${emoji} ${rawName}`;
  return `${displayName} x${ref.quantity}`;
}

export function PlayerTab({ playthrough }: { playthrough: Playthrough }) {
  const pc = playthrough.playerCharacter;
  return (
    <>
      <h2>Player</h2>
      <article className="card">
        <h3>{pc.name}</h3>
        <p>{pc.description}</p>
        <p><strong>Body:</strong> {pc.bodyType}</p>
        <p><strong>Appearance:</strong> {pc.appearance}</p>
        {pc.clothing.length > 0 ? (
          <>
            <p><strong>Clothing:</strong></p>
            <ul>
              {pc.clothing.map((c, i) => (
                <li key={i}>{c.slot}: {c.name}{c.state ? ` (${c.state})` : ""}</li>
              ))}
            </ul>
          </>
        ) : null}
      </article>

      {pc.conditions.length > 0 ? (
        <>
          <h3>Conditions</h3>
          <ul>{pc.conditions.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </>
      ) : null}

      <h3>Inventory</h3>
      <ul>
        {playthrough.inventory.map((item) => (
          <li key={item.itemId}>{formatItemDisplay(item, playthrough.itemCatalog)}</li>
        ))}
        {playthrough.inventory.length === 0 ? <li>Empty.</li> : null}
      </ul>
    </>
  );
}
