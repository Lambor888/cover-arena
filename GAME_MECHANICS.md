# Cover Arena — Game Mechanics

Current implementation reference, updated 2026-10-30. Historical design proposals are in GAME_DESIGN.md; this document describes the playable prototype. Numeric balance values may change; the shared TypeScript rules are authoritative.

## Match flow

- Two players enter the same room code. The match starts after both join and a three-second countdown.
- Each player starts with 100 HP, zero rage and a full arsenal.
- A match contains three rounds, not a best-of-three early finish. Eliminating the opponent wins a round; simultaneous elimination is a draw.
- Both players press R between rounds. The next round generates a new map and resets health, ammo, rage and terrain.
- After round three, the higher score wins; equal scores produce a draw.
- Disconnecting ends the current round. Rooms are temporary and disappear when the server restarts.
- Training runs locally with a randomly moving opponent; R resets the scene.

## Movement and visibility

The arena is 30 by 30 one-unit tiles, with single-cell-thick walls and square-based blocks. Players move on the ground with WASD and aim toward the mouse. There is no jump. Projectiles can have height and gravity-driven arcs.

Base movement speeds are pistol/grenade 5, sword 6.25, launcher 3.75 and shotgun 4.5 units/second. Diagonal input is normalized. Walls and marble rubble stop movement.

Visibility is omnidirectional but blocked by cover. Unexplored areas are hidden; explored but currently obscured tiles and blocks show dim remembered states, updated when seen again. Hidden enemies and pickups are not shown as remembered objects.

Bushes block sight but allow movement. Partially entering a bush does not reveal the other side; fully entering restricts current sight to the connected bush region. Approximate floating footsteps, shot and explosion cues help locate an unseen opponent without continuously revealing their position.

## Ordinary weapons

One left click produces one attack. Holding does not repeat. Weapons have independent cooldowns; swapping does not reset them. F reloads early; empty magazines reload automatically when reserve ammo remains. Reloading continues while another weapon is selected.

| Weapon | Damage | Attack interval | Magazine | Initial total ammo | Reload |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pistol | 12 | 0.075 s | 10 | Unlimited reserve | 2 s |
| Sword | 25 | 0.55 s | Unlimited | Unlimited | None |
| Launcher | 45 | 2.5 s | 1 | 4 | 4 s |
| Grenade | 40 | 1.8 s | 2 | 6 | 3 s |
| Shotgun | 30 | 0.8 s | 4 | 8 | 3.5 s |

- **Pistol:** visible straight projectiles; solid cover blocks bullets, bushes do not.
- **Sword:** a 120-degree sector with radius 2.8. The 0.12-second swing locks movement and facing; its visual sweep disappears when movement resumes.
- **Launcher:** rockets start at speed 2, accelerate at 30 units/second squared to 54, and explode on impact or after three seconds. Blast radius is 3. Bush contact absorbs the rocket.
- **Grenade:** arcs toward the clicked ground position and can pass over cover. Impact or landing detonates a radius-3 blast; bush contact absorbs it.
- **Shotgun:** a 90-degree cone with radius 7. It knocks opponents back up to 2.5 units, briefly interrupts them, destroys wood in one shot and can ignite exposed oil. Solid cover blocks the attack; ordinary shots do not destroy marble.

Limited-ammo weapons need ammo pickups once their total supply is exhausted. Explosions can affect their owner; cover does not provide a general-purpose blast shield.

## Shared rage and Q abilities

Rage is shared across all weapons, capped at 100. Living players gain 5 per second, plus 0.5 per point of actual damage dealt to an opponent. Self-damage and destroying cover do not award damage rage.

Q spends 100 rage on the selected weapon. Ultimates do not consume ordinary ammunition.

| Weapon | Ultimate |
| --- | --- |
| Pistol — Rapid Fire | Six seconds of faster firing and faster bullets; normal reload requirements remain. |
| Sword — Dash Strike | After a 0.35-second windup, dash toward the cursor. Break cover and collect pickups along the path. Marble rubble blocks the dash. A hit deals 15 damage and stuns for 0.6 seconds; afterward gain 40% movement speed for four seconds. |
| Launcher — Triple Barrage | Three successive volleys of three rockets. The center rocket aims at the cursor; the outer paths follow tangents to a radius-2 circle centered at that target. Close targets use a capped spread. |
| Grenade — Mega Bomb | Throw an enlarged bomb with radius 6; bushes can still absorb it. |
| Shotgun — Breach Blast | Keep the 90-degree cone, extend radius to 9 and destroy affected cover, including marble. Marble leaves blocking rubble. |

## Cover and terrain

| Material | Gameplay |
| --- | --- |
| Wood | Blocks movement, bullets and sight. Three pistol hits or sword strikes destroy it; explosives and shotgun attacks can clear it immediately. Leaves slowing rubble nearby. |
| Marble | Solid sight-blocking cover. Destructive attacks leave a low marble-rubble block only on its original tile. |
| Bush | Blocks sight, permits movement and bullets, slows movement to 35%, absorbs rockets/grenades. Three sword attacks clear it. |
| Water tank | Blocks movement and projectiles but not sight. Breaking it spreads water nearby. |
| Oil tank | Ordinary attacks break it and spill oil. Explosions detonate it, damage nearby cover and can chain into other tanks, leaving fire. |

Ordinary rubble reduces speed to 60%. Marble rubble is different: it blocks movement, does not block sight and cannot be overwritten by water, oil, fire or ordinary rubble.

Water causes sliding and extinguishes burning players. Oil is more slippery and applies the flammable condition. Fire damages players standing in it. Terrain persists for the round, subject to later interactions.

## Elemental conditions

- **Flammable:** white flashing. Oil applies it; entering bushes while not burning can clear it.
- **Burning:** red flashing. A flammable player touched by fire or caught in an explosion ignites and takes ongoing damage.
- Water extinguishes burning and clears flammability.
- A burning player ignites oil tiles they touch.
- A burning player destroys only bushes they physically touch, without triggering a new explosion; the player remains burning.
- Explosions affecting a player in bushes can cause an additional bush blast.
- Weapon explosions can ignite oil on the ground. Oil-tank explosions can trigger nearby tanks.

## Pickups

Every eight seconds, one pickup can spawn, up to nine on the map. Valid surfaces are ordinary ground, water, oil and passable rubble. Spawn selection avoids solid cover, bushes, fire, marble rubble, existing pickups and the immediate area around players. A pickup is removed if its tile becomes unsafe.

Pickups float above the ground with bright outlines. Walking into one collects it.

| Pickup | Color | Effect | Spawn probability |
| --- | --- | --- | ---: |
| Health | Bright green | Restore 35 HP, capped at 100 | 55% |
| Rage | Deep blue | Restore 35 rage, capped at 100 | 30% |
| Ammo | Brass/gold | Restore all magazines and reserves; finish reloads | 15% |

## Tactical examples

- Use Dash Strike to close distance and stun, then switch to a shotgun or sword follow-up.
- Spill oil, force the opponent into it, then ignite the area with an explosion or shotgun.
- Use grenade arcs against cover, while watching for bushes that can absorb the projectile.
- Break marble to change sightlines while leaving low obstacles that stop movement and dashes.

These are possible combinations rather than guaranteed kills. Range, visibility, ammunition, opponent movement and terrain determine the outcome.
