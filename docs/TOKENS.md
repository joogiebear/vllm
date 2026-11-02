# Token use

Claude designed and reviewed OVERCLOCK. Qwen3.8 wrote all the game code, running locally on vLLM
through the Hermes agent.

## Qwen, exact counts from Hermes

| Pass | Input | Output | Tool calls | Time | Finished within its 60-call limit |
| --- | ---: | ---: | ---: | ---: | --- |
| Game rules and tests | 1,568,882 | 101,086 | 39 | 13m 06s | Yes |
| Playable interface | 2,687,402 | 56,867 | 62 | 9m 45s | No, reviewer committed |
| Screens, audio, effects (rejected) | 2,916,342 | 49,554 | 65 | 7m 43s | No |
| Balance and README | 805,853 | 20,211 | 23 | 2m 43s | Yes |
| Fixes after review | 2,876,057 | 64,443 | 68 | 11m 18s | No, reviewer committed |
| **Total** | **10,854,536** | **292,161** | **257** | **44m 35s** | |

## Claude, measured differently

Claude Code exposes the current context size and plan usage, not a running token count.

| Measure | Start | End | Change |
| --- | ---: | ---: | ---: |
| Context size | 294,314 | 368,432 | +74,118 |
| Weekly plan, all models | 86% | 86% | under 1 point |

## Reading these numbers

They are not like for like. Hermes's input figure counts the whole conversation again on every
model call, so most of it is repeated text. Claude's figure is the growth of its context, which
counts each piece of text once and leaves out the resending that also happens on every Claude
turn. Claude's context growth also includes screenshots, logs, and messages unrelated to the
code. The fair comparison is roughly this: Qwen generated 292,161 tokens of output, and Claude
added 74,118 tokens of context in total.
