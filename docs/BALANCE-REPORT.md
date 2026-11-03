# Late-game balance run

Active bot played to 10 Regions or 200 simulated hours (whichever comes first).
Finished at 31h 16m with 10 Regions, 226 prestiges, 413 events claimed.

| Region | Reached | Took | Prestiges | Highest tier (end) | Last upgrade | Last manager |
|---|---|---|---|---|---|---|
| 1 | 5h 39m | 5h 39m | 26 | Dyson Inference Swarm | 5h 0m | 4h 59m |
| 2 | 8h 43m | 3h 4m | 21 | Orbital Compute Ring | 8h 30m | 8h 29m |
| 3 | 11h 35m | 2h 52m | 25 | Orbital Compute Ring | 11h 26m | 11h 25m |
| 4 | 14h 23m | 2h 47m | 22 | Lunar Datacenter | 14h 10m | 14h 8m |
| 5 | 16h 27m | 2h 3m | 18 | Lunar Datacenter | 16h 12m | 16h 10m |
| 6 | 19h 19m | 2h 52m | 26 | Matrioshka Brain | 18h 56m | 18h 55m |
| 7 | 21h 40m | 2h 20m | 19 | Matrioshka Brain | 21h 30m | 21h 29m |
| 8 | 24h 31m | 2h 51m | 23 | Matrioshka Brain | 24h 1m | 24h 1m |
| 9 | 27h 37m | 3h 5m | 18 | Inference Singularity | 26h 55m | 26h 54m |
| 10 | 31h 16m | 3h 39m | 28 | Inference Singularity | 31h 4m | 31h 3m |

Owned counts per tier at the end of each Region:
- Region 1: pi 248, gamer 222, workstation 212, rack 195, cluster 184, datacenter 165, campus 146, swarm 129
- Region 2: pi 251, gamer 227, workstation 222, rack 206, cluster 194, datacenter 182, campus 169, swarm 157, orbital 137
- Region 3: pi 276, gamer 252, workstation 240, rack 230, cluster 221, datacenter 203, campus 189, swarm 177, orbital 164
- Region 4: pi 297, gamer 272, workstation 262, rack 249, cluster 239, datacenter 227, campus 215, swarm 200, orbital 191, lunar 176
- Region 5: pi 327, gamer 307, workstation 300, rack 282, cluster 271, datacenter 256, campus 242, swarm 228, orbital 211, lunar 199
- Region 6: pi 354, gamer 330, workstation 318, rack 302, cluster 294, datacenter 282, campus 263, swarm 245, orbital 228, lunar 216, matrioshka 200
- Region 7: pi 351, gamer 327, workstation 323, rack 313, cluster 306, datacenter 296, campus 283, swarm 270, orbital 257, lunar 247, matrioshka 239
- Region 8: pi 396, gamer 374, workstation 367, rack 353, cluster 342, datacenter 326, campus 314, swarm 298, orbital 278, lunar 265, matrioshka 257
- Region 9: pi 411, gamer 392, workstation 381, rack 366, cluster 357, datacenter 343, campus 329, swarm 312, orbital 300, lunar 287, matrioshka 275, singularity 265
- Region 10: pi 418, gamer 401, workstation 394, rack 383, cluster 375, datacenter 361, campus 353, swarm 341, orbital 327, lunar 316, matrioshka 309, singularity 298

Stalls (more than 20 simulated minutes without any purchase):
- none

Tuned constants:
- REGION_BASE = 4000, REGION_GROWTH = 6.5
- x5 Raspberry Pi output: 2000000
- x5 Gaming GPU output: 10000000
- x5 Workstation output: 100000000
- x5 Rack Server output: 1000000000
- x5 GPU Cluster output: 10000000000
- x5 Datacenter output: 100000000000
- x5 Fusion Campus output: 1650000000000
- x5 Dyson Inference Swarm output: 25500000000000
- x5 Orbital Compute Ring output: 400000000000000
- x5 Lunar Datacenter output: 6500000000000000
- x5 Matrioshka Brain output: 110000000000000000
- x5 Inference Singularity output: 2000000000000000000

Targets (docs/LATE-GAME-DESIGN.md, section 5):
- first Region in 3-5 h: FAIL (at 5h 39m)
- every later Region in 2-5 h, never 0: PASS (3h 4m, 2h 52m, 2h 47m, 2h 3m, 2h 52m, 2h 20m, 2h 51m, 3h 5m, 3h 39m)
- Inference Singularity first owned around Region 8, 20-35 h in: PASS (first owned at Region 9, 27h 37m)
- 10 Regions in 30-50 h: PASS (at 31h 16m)
- tiers 1-4 at 500+ owned by Region 10: FAIL (pi 418, gamer 401, workstation 394, rack 383)
- no stall over 20 min: PASS (none)

Targets still missed: first Region in 3-5 h; tiers 1-4 at 500+ owned by Region 10
