---
title: Player character & personas
section: World
order: 60
---

# Player character & personas

You are a character in the story. The model narrates the world and everyone in it, but never
your decisions — and the app keeps your character's own state the same way it keeps the cast's.

## The player character

The player character is a field on the playthrough itself, not a member of the cast:

```
{ name, description, bodyType, appearance, clothing[], conditions[], flags[] }
```

Being flat is deliberate. The cast carries things the player never needs — a template, a
current location, a memory summary — and the player carries nothing the cast doesn't: no
stats, no skill checks, no separate sex/gender plumbing. What describes your character is what
you or the scenario wrote.

**The Player tab** in the play view shows that state as the world currently sees it:

| Section | Shows |
|---|---|
| Body | Body type and the description you play with |
| Appearance | The appearance text |
| Clothing | Structured items, one per slot, each with an optional state note |
| Conditions | The marks currently on you |
| Inventory | What you're carrying, with quantities |

The tab is a read of your situation, not a form. Your conditions, clothing and inventory change
as the story moves — the model proposes those changes each turn and the engine applies them.

## Personas

A persona is a reusable player template: the same person, ready to drop into any new story.

```
data/personas/<slug>/     one folder per persona
```

A persona holds a name, description, body type, appearance, and starting clothing — added slot
by slot, one item per slot. The persona library lists them with the default marked, and lets
you create, edit, delete, and choose which one is the default.

The default persona is pre-selected when you start a new playthrough, and the setup step lets
you pick a different one for that story.

## Copy-on-create

Starting a playthrough **copies** the persona into the playthrough's player character. From
that point the two are independent:

- editing a persona changes that persona, and every playthrough you start with it afterwards
- it does not reach into a story already in progress

That is why the player character's clothing list is its own: what you're wearing three chapters
in is story state, and the persona's starting clothing is only where it began.
