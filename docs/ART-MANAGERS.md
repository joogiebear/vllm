# OVERCLOCK manager portraits: specs and prompts

Style reference: `manager-pi-v1.png` (Cron Job). Keep every manager in that
exact style so the 12 look like one set.

## Every image

- PNG, transparent background, 1024×1024, square.
- Head and shoulders, centred, about **5% margin** (tighter than Cron Job v1).
- **Clean cut-out edge**: no glow or halo left from background removal. A
  thin solid off-white rim around the outline is fine.
- Main colour = the tier colour below, plus off-white and dark grey, plus
  **one contrasting accent** so it doesn't melt into its same-colour ring.
- Bold dark outlines, flat cel shading, chunky simple shapes, no text.
- Must read at 56 px (round button) and 160 px (Managers list).
- File name: `manager-<id>.png`.

## Shared prompt (paste first, then the character line)

> cute cartoon robot mascot, head and shoulders portrait, centered, tight
> crop, bold dark outlines, flat cel shading, chunky simple shapes, friendly
> expressive face, clean edges, transparent background, mobile idle game
> character icon, no text,

## The 12

| # | File | Manager (row) | Main / accent | Character line to add to the prompt |
| --- | --- | --- | --- | --- |
| 1 | manager-pi.png | Cron Job (Raspberry Pi) | teal #4fd1c5 / orange | *(done: redo with tighter crop, clean edge, orange tie)* sleepy alarm-clock robot, round clock-face head with two bells, half-closed eyes, holding a coffee mug, small orange tie, teal and off-white |
| 2 | manager-gamer.png | Driver Daemon (Gaming GPU) | blue #63b3ed / hot pink | hyped gamer robot, head shaped like a graphics card with a spinning fan on the forehead, RGB headset, big grin, thumbs up, blue with hot pink RGB lights |
| 3 | manager-workstation.png | Build Bot (Workstation) | lavender #b794f4 / yellow | cheerful construction robot, boxy computer-tower body, yellow hard hat, wrench in hand, purple and off-white with yellow accents |
| 4 | manager-rack.png | Load Balancer (Rack Server) | orange #f6ad55 / teal | juggling robot, body like stacked server slabs with blinking LEDs, juggling three glowing data balls, confident smile, orange with teal balls |
| 5 | manager-cluster.png | Scheduler (GPU Cluster) | pink #f687b3 / green | organised robot with a clipboard and a pencil behind its ear, square head with a small calendar grid screen, glasses, pink with green checkmarks |
| 6 | manager-datacenter.png | Orchestrator (Datacenter) | green #68d391 / gold | conductor robot with a baton, tuxedo bow tie, tall rounded head with antenna, dramatic pose, green with gold buttons |
| 7 | manager-campus.png | Fleet Controller (Fusion Campus) | yellow #f6e05e / deep blue | captain robot with a peaked captain's hat, glowing atom emblem on chest, walkie-talkie, proud expression, yellow with deep blue hat |
| 8 | manager-swarm.png | Swarm Mind (Dyson Swarm) | coral #fc8181 / cyan | calm meditating robot with a glowing sun-like head surrounded by six tiny orbiting drones, serene closed eyes, coral with cyan drones |
| 9 | manager-orbital.png | Orbit Ops (Orbital Ring) | violet #9b5cf6 / orange | astronaut robot in a round space helmet visor showing a smiling face, small planet with a ring floating beside it, violet suit with orange patches |
| 10 | manager-lunar.png | Lunar Admin (Lunar Datacenter) | sky blue #38bdf8 / silver | relaxed moon-base robot, crescent-moon shaped head, tiny satellite dish on top, holding a mug labelled with a moon icon, sky blue and silver |
| 11 | manager-matrioshka.png | Brain Warden (Matrioshka Brain) | rose #f43f5e / pale blue | wise guardian robot, transparent dome head showing a glowing brain made of nested rings, small shield badge, calm smile, rose red with pale blue glow |
| 12 | manager-singularity.png | Event Horizon (Singularity) | gold #eab308 / purple | mysterious cosmic robot, head is a swirling spiral galaxy with two bright eyes, tiny stars floating around, slight smirk, gold with deep purple space |

## Tips for a consistent set

- Generate them in one session with the same tool and settings, and give the
  tool `manager-pi-v1.png` as a style or image reference if it supports one.
- If a result has a ragged edge, re-run background removal at a higher
  threshold, or add "thin off-white sticker outline" to the prompt.
- Send them in batches of 3 or 4. I check each at 56 and 160 px on the dark
  background before they go in the game.
