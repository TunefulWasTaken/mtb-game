# MTB Game

A 3D downhill mountain bike game that runs in the browser, with realistic, unforgiving physics.

Working title. See [DESIGN.md](DESIGN.md) for the plan and ideas.

## Play it

**Play in your browser: https://tunefulwastaken.github.io/mtb-game/**

To run it on your own computer instead, you need [Node.js](https://nodejs.org). From this folder run:

```bash
node serve.js
```

Then open <http://localhost:5173> in your browser.

## Controls

| Key | Action |
| --- | --- |
| W | Pedal |
| S | Brake (both brakes, squeezes on progressively) |
| A / D | Steer and lean. In the air: whip the bike sideways |
| ↑ / ↓ | Shift your weight forward / back. In the air: rotate (flips on big jumps) |
| Space | Hold to crouch, release to hop |
| C | Switch between 3rd-person and 1st-person camera |
| R | Respawn at the last checkpoint |
| T | Back to the top |
| N | Switch to the next trail |
| H | Hide the controls panel |

Tips: let go of the keys before you land and the rider lines the bike up with the ground.
Don't grab the front brake with a wheel in the air, and roots are slippery.

## What's in it

- A forest mountain with two trails:
  - **Jump Line**: 25 tabletops and gap jumps, built for whips and flips
  - **Downhill**: 1.2 km with berms, root sections, rock gardens, drops and tabletop jumps
- A detailed downhill bike: dual-crown fork, coil shock and linkage, spoked wheels with knobby tyres,
  disc brakes, drivetrain and cockpit, all moving with the suspension and steering
- A rider who stays on the grips and pedals, and ragdolls off the bike in a crash
- Physics on [Rapier](https://rapier.rs): suspension with progressive springs and damping,
  tyre grip that changes on dirt, forest floor, roots and rock, leaning into turns,
  brake endos, bad landings and big impacts
- Run timer, best time and checkpoints

## Code

- `src/main.js`: setup and game loop
- `src/world.js`: terrain, trail carving, trail features, rocks, roots, tape and gates
- `src/tracks.js`: track layouts and features
- `src/forest.js`: trees, bushes, ferns, logs
- `src/bikes.js`: bike specs
- `src/bike.js`: bike physics
- `src/bikeModel.js`: the 3D bike model
- `src/rider.js`: rider pose and ragdoll
- `src/cameras.js`, `src/input.js`
- `dev/autopilot.js`: test helper that rides the track without rendering

Built with [three.js](https://threejs.org) and Rapier, loaded from a CDN, so there's no build step.
