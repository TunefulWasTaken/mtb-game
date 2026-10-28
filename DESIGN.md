# MTB Game — Design Notes

Working name: `mtb-game` (final name not chosen yet).

An original 3D downhill mountain bike game played in the browser.
Top priority: good gravity and physics.

## Decisions

- **Repository:** private on GitHub for now, maybe public later
- **Setting:** a simple forest area to start
- **Tracks** (fixed and detailed):
  1. Downhill: steep, rough and fast, with roots, rocks and drops
  2. Jump downhill: a flowing descent with lots of jumps and berms
  3. Dirt jump: a line of built jumps
- **Bikes:** downhill, freeride/jump and dirt jumper. Any bike can ride any track,
  but each one performs best on the track it's made for.
- **Gameplay:** mostly free-ride exploration
- **Tricks:** a few simple ones to start, more later
- **Crashes:** the rider ragdolls off the bike
- **Physics:** realistic and hard
- **Bike customisation:** not yet
- **Rider:** a simple figure for now
- **Controls:** keyboard
- **Camera:** first-person and third-person, with a key to switch
- **Look:** not realistic, but detailed shapes (stylised, with detailed bike parts)
- **Sound / music:** not yet

## Tech plan

- Three.js for graphics
- Rapier for physics
- Bike models built in code

## Build stages

1. First version: the forest, the downhill track, one bike, both cameras, keyboard
   controls, ragdoll
2. Physics tuning through playtesting
3. Jump downhill and dirt jump tracks, plus their bikes
4. Simple tricks

## Future ideas

- **Trail builder:** a mode where the player can build their own trails, jumps,
  berms, drops and other features, then ride them
- More tricks
- Bike customisation
- Sound and music
- More environments
