import type { InventoryRef, Item, Playthrough } from "../../../../../schemas";
import { ITEMS } from "../../../../../engine/demoData";
import { AvatarBadge, Icon } from "../../../base";

function getItemDef(ref: InventoryRef, catalog: Item[] | undefined): { name: string; type: string; description?: string } {
  const def = catalog?.find((i) => i.id === ref.itemId) ?? ITEMS.find((i) => i.id === ref.itemId);
  return {
    name: def?.name ?? ref.itemId,
    type: def?.type ?? "misc",
    description: def?.description,
  };
}

function getItemIconName(type: string): string {
  switch (type.toLowerCase()) {
    case "consumable":
      return "FlaskConical";
    case "equipment":
    case "weapon":
      return "Sword";
    case "armor":
      return "Shield";
    case "key":
    case "key item":
      return "Key";
    case "tool":
      return "Wrench";
    default:
      return "Package";
  }
}

export function PlayerTab({ playthrough }: { playthrough: Playthrough }) {
  const pc = playthrough.playerCharacter;
  const inventoryCount = playthrough.inventory.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="player-tab-container">
      <article className="card player-overview-card">
        <div className="player-card-header">
          <AvatarBadge name={pc.name} icon="User" size="md" />
          <div>
            <h3 className="player-name">{pc.name}</h3>
            {pc.description ? <p className="player-desc">{pc.description}</p> : null}
          </div>
        </div>

        {pc.bodyType || pc.appearance ? (
          <div className="player-meta-grid">
            {pc.bodyType ? (
              <div className="player-meta-item">
                <span className="meta-label"><Icon name="Activity" size={12} /> Body</span>
                <span className="meta-val">{pc.bodyType}</span>
              </div>
            ) : null}
            {pc.appearance ? (
              <div className="player-meta-item">
                <span className="meta-label"><Icon name="Eye" size={12} /> Appearance</span>
                <span className="meta-val">{pc.appearance}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {pc.clothing.length > 0 ? (
          <div className="player-clothing-section">
            <h4 className="subcard-title flex items-center gap-1">
              <Icon name="Shirt" size={13} /> Clothing
            </h4>
            <div className="clothing-chip-grid">
              {pc.clothing.map((c, i) => (
                <div key={i} className="clothing-chip">
                  <span className="clothing-slot">{c.slot}:</span>
                  <span className="clothing-name">{c.name}</span>
                  {c.state ? <span className="clothing-state">({c.state})</span> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </article>

      <section className="player-section">
        <h3 className="section-subtitle flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Icon name="Zap" size={15} /> Conditions
          </span>
          <span className="badge-count">{pc.conditions.length}</span>
        </h3>
        {pc.conditions.length > 0 ? (
          <div className="conditions-grid">
            {pc.conditions.map((c, i) => (
              <div key={i} className="condition-chip">
                <Icon name="Activity" size={14} className="condition-icon" />
                <span className="condition-text">{c}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="info-empty-state">
            <Icon name="ShieldCheck" size={15} />
            <span>No active conditions</span>
          </div>
        )}
      </section>

      <section className="player-section">
        <h3 className="section-subtitle flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Icon name="Package" size={15} /> Inventory
          </span>
          <span className="badge-count">{inventoryCount}</span>
        </h3>
        {playthrough.inventory.length > 0 ? (
          <div className="inventory-grid">
            {playthrough.inventory.map((item) => {
              const def = getItemDef(item, playthrough.itemCatalog);
              const iconName = getItemIconName(def.type);
              return (
                <div key={item.itemId} className="inventory-card">
                  <div className="inventory-card-top">
                    <div className="inventory-card-title flex items-center gap-1.5">
                      <span className="inventory-type-icon">
                        <Icon name={iconName} size={14} />
                      </span>
                      <strong className="item-name">{def.name}</strong>
                    </div>
                    <span className="item-qty-badge">x{item.quantity}</span>
                  </div>
                  <div className="inventory-card-meta">
                    <span className="item-type-tag">{def.type}</span>
                  </div>
                  {def.description ? (
                    <p className="item-desc">{def.description}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="info-empty-state">
            <Icon name="PackageOpen" size={16} />
            <span>Inventory is empty</span>
          </div>
        )}
      </section>
    </div>
  );
}
