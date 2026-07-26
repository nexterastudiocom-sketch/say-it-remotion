# The Say It Method

**Version 1.1 · Canonical specification**
Applies to: all Say It language channels (FR, ES, IT, PT, DE) and the Say It companion app.

This document is the single source of truth for how a Say It lesson is designed, authored, rendered, and quality-checked. Every lesson is written against Part II–VI and validated against the rule table in Part VII.

---

## Part I · Thesis and scope

### 1.1 The claim

Recognition is not production. A learner who can pick "hello" from four options when shown *bonjour* has not learned to greet anyone. The Say It Method is built on the position that the unit of learning is **an utterance the learner produced themselves, unaided, from meaning.**

Everything in this spec exists to move items up the support ladder (§4) until the learner produces them cold.

### 1.2 What the video can and cannot do

One-way video is structurally incapable of four things: real interaction, diagnostic feedback, adaptivity, and repair of the learner's actual errors. No transcript design fixes this.

Therefore the method is **two-instrument**:

| Instrument | Carries |
|---|---|
| **Video** | Comprehensible input, form instruction, guided production, fluency, transfer prompts |
| **App** | Spaced retrieval, production-cued review, error diagnosis, adaptive scheduling, corrective feedback |

The app is not a companion. It is the half of the method that carries the features video cannot. Any feature list that treats the app as a flashcard box is under-specifying the method.

### 1.3 Success definition

A lesson succeeds when the learner can perform the lesson's Can-Do statement in an **unrehearsed** situation, and can still do it after a delay. Not when they finished the video.

---

## Part II · Vocabulary of the method

| Term | Definition |
|---|---|
| **Item** | A word or fixed chunk being taught (`bonjour`, `s'il vous plaît`) |
| **Frame** | A sentence skeleton with swappable slots (`[greeting], [person]. [courtesy]!`) |
| **Slot** | A position in a frame that accepts more than one item |
| **Beat** | One voice line plus its following pause — the atomic unit of a transcript |
| **Block** | A group of beats teaching one item (MEET + ECHO + PRODUCE + REPAIR) |
| **Stage** | One of the 12 macro sections of a lesson |
| **Phase** | One of 6 groupings of stages (Frame, Input, Acquire, Build, Produce, Consolidate) |
| **Support level** | L0–L5, how much scaffolding is on screen and in audio (§4) |
| **Can-Do** | A capability statement in the form "I can ___ in ___ situation" |
| **Cue** | The fixed instruction phrase that tells the learner what kind of action to take (§6) |
| **Allowed set** | Cumulative vocabulary from lessons 1..N — the only words FR voices may say |

---

## Part III · Macro lesson algorithm

### 3.1 The twelve stages

```
LESSON(n, level, can_do, new_items[]):

  PHASE 1 — FRAME
  ├─ 01. CAN-DO GOAL
  │      State the capability, not the topic.
  │      "By the end you can greet someone and take your leave,
  │       choosing the right formality and time of day."
  │      Show: goal card + can-do text.
  │
  └─ 02. WARM-UP RETRIEVAL                    [skip if n == 1]
         Pull items per SPACING_SCHEDULE(n) — §8.
         All warm-up beats run at L3 or higher. Never L0–L2.
         Cue: "Your turn." No models before the pause.

  PHASE 2 — INPUT
  └─ 03. COLD INPUT
         A connected dialogue between FR·WOMAN and FR·MAN.
         Length per DENSITY_TABLE(level) — §11.
         Vocabulary: allowed_set(n-1) ∪ new_items — no more.
         Played once, unglossed. Learner is told: understand what you can.
         Then ONE comprehension question in EN, answered in EN.
         Purpose: comprehensible input + a measurable before-state.

  PHASE 3 — ACQUIRE
  ├─ 04. ITEM BLOCKS                          [repeat per item]
  │      For each item: CORE_LOOP(item) — §5.
  │
  └─ 05. MICRO-RECALL                         [after every ≤3 items]
         Bidirectional. FR→EN then EN→FR.
         EN→FR beats run at L3 (screen blank).

  PHASE 4 — BUILD
  ├─ 06. FRAME INTRODUCTION
  │      Name the frame and its slots explicitly.
  │      "Greeting, then person, then courtesy. Three slots."
  │
  └─ 07. BUILD LADDER
         BUILD_LOOP(frame) — §7.
         Ends with at least one two-slot cold swap at L4.

  PHASE 5 — PRODUCE
  ├─ 08. INPUT RETURN
  │      Replay the Stage 03 dialogue, unchanged.
  │      Learner is asked what they understand now vs. then.
  │      This is the lesson's own evidence of gain. Do not cut it.
  │
  ├─ 09. MAKE IT YOURS                        [3–4 scenarios]
  │      Situation given, target sentence NOT given. L4.
  │      Speak first, then write.
  │      Each followed by ONE model + an explicit "if yours differs
  │      but the pieces fit, it's right."
  │      At least one scenario is PERSONALIZED — anchored to the
  │      learner's own life (their city, their morning, their job).
  │
  └─ 10. TRANSFER TASK                        [L5]
         A situation that was NOT rehearsed anywhere in the lesson,
         solvable only by recombining taught items.
         Blank screen. Timed. This is the lesson's real test.

  PHASE 6 — CONSOLIDATE
  ├─ 11. FLUENCY ROUND                        [L3, shrinking pauses]
  │      Same 4–6 sentences, three passes.
  │      Pause multiplier: 3.0 → 2.0 → 1.4.
  │      Rate: slow → natural → natural.
  │      Purpose is automaticity, not accuracy. Do not add new items.
  │
  └─ 12. CAN-DO CHECK + HANDOFF
         Restate the Can-Do as a question the learner answers yes/no.
         Scorecard asserts CAPABILITY, not word count.
         Name the app review window: "these come back in two days."
```

### 3.2 Ordering constraints

- No item may appear in BUILD before its ACQUIRE block. **Lesson 1 v2 violated this** — `madame` and `monsieur` appeared in BUILD before being taught. Fixed in v3.
- COLD INPUT (03) and INPUT RETURN (08) must use the identical audio file.
- TRANSFER TASK (10) must come after all MAKE IT YOURS (09).
- FLUENCY ROUND (11) must contain zero first-appearances.

---

## Part IV · Support level ladder

The engine of the method. Every beat carries a support level.

| Level | Audio model | On-screen French | Cue type | Learner action |
|---|---|---|---|---|
| **L0** | Yes | Word + phonetic + image + English | "Repeat after me" | Copy |
| **L1** | Yes | Word only | "Repeat after me" | Copy |
| **L2** | No | Word only | "Your turn" | Read aloud |
| **L3** | No | None | English prompt | Produce from meaning |
| **L4** | No | None | Situation described, target unnamed | Produce from context |
| **L5** | No | None | Situation, timed, no word bank | Produce under pressure |

### 4.1 Ladder rules

```
X-01  Every new item reaches ≥ L3 within its own lesson.
X-02  ≥ 30% of a lesson's items reach L4.
X-03  ≥ 1 beat in every lesson runs at L5.
X-04  Support never increases for an item WITHIN A LADDER.
      There are three ladders per lesson:
        acquire  = ITEM_BLOCK, MICRO_RECALL
        build    = FRAME_INTRO, BUILD_LADDER
        produce  = MAKE_IT_YOURS, TRANSFER_TASK
      A known item may restart at L1 inside the build ladder —
      the item is known but the FRAME is new, and a new frame
      earns its own scaffold. Restarting inside the SAME ladder
      is a violation.
      WARM_UP, COLD_INPUT, INPUT_RETURN and FLUENCY_ROUND are
      outside the ladders and exempt.
X-05  Warm-up (stage 02) starts at L3 minimum — never re-teach.
X-06  On-screen French is FORBIDDEN at L3 and above.
      Displaying the answer during a retrieval pause destroys
      the retrieval. This is the single most common render bug.
X-07  Chunk bars at L3+ display ENGLISH SLOT LABELS
      ([ greeting ][ person ][ courtesy ]), never the filled
      French. Below L3 they may show the French chunks.
      Without this, X-06 and I-03 are in direct conflict —
      a build step cannot both show its chunk bar and hide
      the answer unless the bar is labelled, not filled.
```

X-06 is the rule most likely to be broken silently by the video pipeline, because a word card left on screen from a previous segment looks harmless. It isn't.

---

## Part V · Core Loop (per item)

```
CORE_LOOP(item):

  MEET      L0
    EN: "Listen. Don't say anything yet."          pause 0.6
    FR: item                    [rate: slow]        pause = P(copy)
    EN: english gloss                               pause 0.8
    FR: syllable split          [rate: very slow]   pause = P(copy)
    EN: ONE form note — the single hardest thing
        about this word (nasal, silent letter,
        uvular R, spelling trap). Not a list.       pause 0.8
    FR: item                    [rate: slow]        pause = P(copy)

  ECHO      L1
    EN: "Repeat after me."                          pause 0.6
    FR: item                    [rate: slow]        pause = P(copy)
    FR: item                    [rate: slow]        pause = P(copy)
    EN: "Again — normal speed."                     pause 0.6
    FR: item                    [rate: natural]     pause = P(copy)

  PRODUCE   L3
    EN: english cue only                            pause = P(produce_meaning)
    FR: item                    [rate: natural]     pause 1.0   ← confirm

  REPAIR    L3          ← NEW in v1, closes framework feature #7
    EN: "Now you've heard it. Say it again."        pause = P(produce_meaning) × 0.8
    (no confirm — the learner's second attempt is the endpoint)
```

### 5.1 Long items get chunked ECHO

If `syllables(item) ≥ 4`, ECHO becomes progressive:

```
  FR: chunk_1                   [rate: very slow]
  FR: chunk_1 + chunk_2         [rate: very slow]
  FR: full item                 [rate: slow]
  FR: full item                 [rate: natural]
```

Applies to `s'il vous plaît`, `à bientôt`, `comment allez-vous`, etc.

### 5.2 Why REPAIR matters

Playing the correct model after a pause is *knowledge of correct response* — the weakest feedback type there is. It tells the learner they were wrong but gives them no chance to act on it. The REPAIR beat converts a passive model into a retry. It costs 3 seconds and is the only form of corrective feedback available inside one-way video.

---

## Part VI · Build Loop (per frame)

```
BUILD_LOOP(frame):

  ANNOUNCE
    EN: name the frame and its slot count.
    Show: chunk bar with empty slots.

  For each build step:

    ┌─ HEAR    L1   FR model of the current sentence     [rate: slow]
    ├─ TRY     L2   EN: "Your turn."  → pause, no model
    └─ CONFIRM L1   FR model again                       [rate: natural]

  Step sequence:
    1. Single slot filled                 HEAR → TRY → CONFIRM
    2. Add slot 2                         HEAR → TRY → CONFIRM
    3. Swap slot 2                        TRY-FIRST → CONFIRM     ← cold
    4. Add slot 3                         HEAR → TRY → CONFIRM
    5. Swap slot 1                        TRY-FIRST → CONFIRM     ← cold
    6. Swap two slots at once             TRY-FIRST → CONFIRM     ← L4
```

### 6.1 Build rules

```
S-04  Every build step is HEAR → TRY → CONFIRM or TRY-FIRST → CONFIRM.
      A build step with a model and no pause is not a build step.
S-05  ≥ 2 steps in every BUILD_LOOP are TRY-FIRST (cold).
S-06  The final build step swaps ≥ 2 slots simultaneously.
S-07  Exactly ONE slot changes per step, except the final step.
I-03  Every build step shows a chunk bar. The CHANGED chunk animates
      or highlights. A static chunk bar through a build swap is a
      render failure — the visual change IS the teaching.
```

Rule I-03 is why BUILD felt hollow in the v2 render. The learner was being told a swap happened but shown nothing swapping.

---

## Part VII · Timing algorithms

### 7.1 Estimated audio length

```
syllables(text)  = count of vowel nuclei in the French text
rate_factor      = { very_slow: 2.0, slow: 1.5, natural: 1.0, fast: 0.8 }

est_audio(text, rate) = syllables(text) × 0.30s × rate_factor[rate]
```

### 7.2 Pause function

```
P(beat):

  EN instruction beat        →  0.6 – 1.2s        (transition only)
  EN culture / writing note  →  1.2s
  FR confirm beat            →  0.8 – 1.2s

  copy              (L0/L1)  →  max(1.5, 2.0 × est_audio)
  read aloud        (L2)     →  max(2.0, 2.5 × est_audio)
  produce_meaning   (L3)     →  max(2.5, 3.0 × est_audio)
  produce_situation (L4)     →  max(3.0, 3.5 × est_audio)
  produce_cold      (L5)     →  max(3.5, 4.0 × est_audio)
  written production         →  12s
  fluency pass 1/2/3         →  3.0× / 2.0× / 1.4× est_audio
```

### 7.3 Pause rules

```
P-01  Pause after an EN instruction never exceeds 1.2s.
      Long silence after English = dead air. The learner has
      nothing to do. This was the dominant pacing bug in v2.
P-02  Every pause > 2.5s must be a production pause (L2+).
P-03  Every production pause must be followed by an FR confirm,
      EXCEPT: REPAIR beats and written production.
P-04  Total pause time = 35–50% of runtime.
P-05  No two consecutive pauses > 3s without an intervening
      voice line (creates the sensation of a stalled video).
```

### 7.4 Rate algorithm

```
R(item, exposure_index):
  exposure 1              → slow
  syllable-split beat     → very slow
  exposure 2              → slow
  exposure 3+             → natural
  fluency pass 3          → fast

R-01  The first FR utterance of any new item is slow or very slow.
      NEVER natural. Opening a word at natural speed is the
      difference between teaching it and mentioning it.
R-02  Rate is monotonic: never slow down after going natural
      within the same item, except in a deliberate re-teach.
R-03  Multi-item FR lines (recap lists) run at slow, not natural.
```

---

## Part VIII · Vocabulary gate

```
allowed_set(n) = ⋃ items(lesson 1 .. lesson n)

V-01  Every lemma in every FR voice line ∈ allowed_set(n).
V-02  Affirmations and filler are items like any other.
      Bravo, Voilà, Exactement, Parfait, Très bien, D'accord,
      Super, Génial — FORBIDDEN unless explicitly taught.
V-03  Proper nouns (place names, person names) are exempt
      but must be phonetically transparent at the current level.
V-04  EN voice lines may name a French word only if it is
      in allowed_set(n).
```

The v2 Lesson 1 summary contained `FR·WOMAN → Bravo !` — a V-02 violation. It reached render because the QC harness was checking the vocabulary list but not the affirmation blocklist. Both are now required.

---

## Part IX · Spacing algorithm

### 9.1 Cross-lesson warm-up (video)

```
SPACING_SCHEDULE(n):
  from lesson n-1   → 100% of items,  at L3
  from lesson n-3   →  50% sample,    at L3
  from lesson n-7   →  33% sample,    at L4
  from lesson n-15  →  25% sample,    at L4

  Sampling is weighted by app error rate where available:
  items the cohort fails most are sampled first.
  Total warm-up: 90–150 seconds.
```

### 9.2 App review (Leitner, production-cued)

```
Box:       0    1    2    3    4    5    LTM
Interval:  0    1d   2d   4d   8d   16d  32d

Correct → advance one box.
Wrong   → return to Box 1. Always Box 1, never Box 0.

CUE TYPE BY BOX:
  Box 0–1  →  recognition permitted (introduction / rescue)
  Box 2+   →  PRODUCTION-CUED ONLY
              English prompt or situation → learner speaks →
              ASR scores → pass/fail
```

The Box 2+ rule is load-bearing. A method whose thesis is spoken production cannot have a review system that tests recognition — the app would be actively reinforcing the exact skill the method claims is worthless. This is the highest-priority app change.

---

## Part X · Voice and format conventions

Voices work in **pairs**, not per-phase. The old convention (EN·MAN teaches, EN·WOMAN practices, FR·WOMAN always) is self-contradictory: it puts EN·WOMAN next to FR·WOMAN, violating the same-gender rule. Resolved as follows.

```
PAIR T — teaching     EN·MAN   + FR·WOMAN
PAIR P — practice     EN·WOMAN + FR·MAN

(Named T and P, not A and B — A and B are reserved for the two QA gates.)

Stage → pair:
  T:  CAN_DO_GOAL, ITEM_BLOCK, FRAME_INTRO, BUILD_LADDER
  P:  WARM_UP, MICRO_RECALL, MAKE_IT_YOURS,
      TRANSFER_TASK, FLUENCY_ROUND, CAN_DO_CHECK
  Dialogue (COLD_INPUT, INPUT_RETURN): both FR voices in
      conversation; EN framing lines use EN·MAN.

VO-01  Every beat's voice belongs to its stage's pair (T or P).
VO-02  Dialogue framing (the comprehension question) uses EN·MAN.
VO-03  A section never contains an EN and an FR voice of the
       same gender.
VO-04  Pairs change only at section boundaries, never mid-section.
```

This also puts FR·MAN to real work rather than reserving him for two stages, which improves voice variety across a lesson without breaking any constraint.

### 10.1 Transcript notation

```
  VOICE  [PHASE] [Ln]  →  [rate: x] text
    ⏸ PAUSE Ns  [PHASE]
  🖼 VISUAL DIRECTIVE
```

Every beat carries: voice, phase, support level, rate (FR only), pause.
Every MEET, every BUILD step, and every scenario carries a 🖼 directive.

### 10.2 Image directives

```
I-01  Every MEET has a word card: item + phonetic + illustration.
I-02  Every syllable-split beat has a split-syllable visual.
I-03  Every BUILD step has a chunk bar with the changed chunk marked.
I-04  Every production pause shows a mic indicator.
I-05  L3+ beats show NO French text. (= X-06)
I-06  Every MAKE IT YOURS shows a scene illustration + word bank.
      The word bank lists ENGLISH glosses, not French.
```

---

## Part XI · Density parameters by level

Lesson 1 is deliberately light. Density scales — do not hold later lessons to Lesson 1's item count, and do not judge Lesson 1's efficiency against later lessons.

| Band | Items | Cold input | Frames | Runtime | Class |
|---|---|---|---|---|---|
| A1 L1–L5 | 10–14 | 20–40s | 1 | 18–22 min | Calibration |
| A1 L6–L15 | 14–18 | 40–60s | 1–2 | 20–24 min | Standard |
| A1 L16–L30 | 16–20 | 60–90s | 2 | 22–26 min | Standard |
| A2 | 20–25 | 90–120s | 2–3 | 24–28 min | Standard |
| B1 | 25–30 | 2–3 min | 3 | 26–32 min | Standard |

### 11.1 Lesson classes

```
CALIBRATION   Lessons 1–3 of any level.
              Reduced density. Method itself is being taught
              alongside content. Exempt from efficiency scoring.

STANDARD      Default. Full 12-stage structure.

CONSOLIDATION Every 5th lesson (5, 10, 15, 20, 25, 30).
              ZERO new items. All 12 stages run on prior content
              at L3–L5 only. Carries the spacing load.
              Runtime 15–18 min.

MILESTONE     Every 10th lesson (10, 20, 30).
              Consolidation + a scored assessment block using
              UNSEEN situations. Produces the retention data
              the evaluation framework needs.
```

Consolidation and Milestone lessons are how the method generates its own evidence. They are not optional filler — they are the measurement instrument.

---

## Part XII · QA rule table

Machine-checkable. Every rule has an ID, a layer, and a severity.

**Severity:** `BLOCK` = do not render · `WARN` = flag for human review · `INFO` = log only

### Structure (S)

| ID | Rule | Sev |
|---|---|---|
| S-01 | All 12 stages present and in order | BLOCK |
| S-02 | Every new item has MEET → ECHO → PRODUCE → REPAIR | BLOCK |
| S-03 | Micro-recall after every ≤3 new items | WARN |
| S-04 | Every build step is HEAR→TRY→CONFIRM or TRY-FIRST→CONFIRM | BLOCK |
| S-05 | ≥2 TRY-FIRST build steps | BLOCK |
| S-06 | Final build step swaps ≥2 slots | WARN |
| S-07 | Exactly one slot changes per build step (except final) | WARN |
| S-08 | COLD INPUT and INPUT RETURN use identical audio | BLOCK |
| S-09 | ≥3 MAKE IT YOURS with distinct situations | BLOCK |
| S-10 | ≥1 personalized MAKE IT YOURS | WARN |
| S-11 | TRANSFER TASK situation appears nowhere earlier in lesson | BLOCK |
| S-12 | FLUENCY ROUND contains zero first-appearances | BLOCK |
| S-13 | No item appears in BUILD before its ACQUIRE block | BLOCK |
| S-14 | Can-Do stated at stage 01 and re-asked at stage 12 | BLOCK |
| S-15 | Scorecard asserts capability, not word count | WARN |

### Cues (C)

| ID | Rule | Sev |
|---|---|---|
| C-01 | "Repeat after me" is immediately followed by an FR model before the pause | BLOCK |
| C-02 | "Your turn" / "Now you" has NO FR model of the target in the preceding beat | BLOCK |
| C-03 | Every "Your turn" pause is followed by an FR confirm (except REPAIR, written) | BLOCK |
| C-04 | Only approved cue phrases used: repeat after me / your turn / now you / listen | WARN |
| C-05 | Cue phrase matches the beat's support level | BLOCK |

### Vocabulary (V)

| ID | Rule | Sev |
|---|---|---|
| V-01 | All FR lemmas ∈ allowed_set(n) | BLOCK |
| V-02 | No affirmations/filler in FR unless taught | BLOCK |
| V-03 | EN lines name French words only from allowed_set(n) | WARN |
| V-04 | COLD INPUT uses only allowed_set(n-1) ∪ new_items | BLOCK |

### Pause (P)

| ID | Rule | Sev |
|---|---|---|
| P-01 | Pause after EN instruction ≤ 1.2s | BLOCK |
| P-02 | Every pause > 2.5s is a production pause | BLOCK |
| P-03 | Production pause ≥ computed P(beat) − 0.3s | WARN |
| P-04 | Written production pause = 12s ± 2 | WARN |
| P-05 | Total pause time 35–50% of runtime | WARN |
| P-06 | No two consecutive pauses > 3s | WARN |

### Rate (R)

| ID | Rule | Sev |
|---|---|---|
| R-01 | First FR utterance of a new item is slow or very slow | BLOCK |
| R-02 | Syllable-split beats are very slow | BLOCK |
| R-03 | No natural rate before exposure 3 | BLOCK |
| R-04 | Rate is monotonic within an item | WARN |
| R-05 | Multi-item recap lines are slow | WARN |

### Support ladder (X)

| ID | Rule | Sev |
|---|---|---|
| X-01 | Every item reaches ≥L3 in its lesson | BLOCK |
| X-02 | ≥30% of items reach L4 | WARN |
| X-03 | ≥1 beat at L5 | BLOCK |
| X-04 | Support monotonically decreases per item, per ladder | BLOCK |
| X-07 | Chunk bars at L3+ show English slot labels, not French | BLOCK |
| X-05 | Warm-up beats are L3+ | BLOCK |
| X-06 | No on-screen French at L3+ | BLOCK |

### Visual (I)

| ID | Rule | Sev |
|---|---|---|
| I-01 | Every MEET has a word card | BLOCK |
| I-02 | Every syllable-split has a split visual | WARN |
| I-03 | Every build step has a chunk bar with the change marked | BLOCK |
| I-04 | Every production pause shows a mic indicator | WARN |
| I-05 | No French text rendered during L3+ pauses | BLOCK |
| I-06 | Word banks list English, not French | BLOCK |

### Voice (VO)

| ID | Rule | Sev |
|---|---|---|
| VO-01 | Every beat's voice belongs to its stage's pair | BLOCK |
| VO-02 | Dialogue framing uses EN·MAN | WARN |
| VO-03 | No same-gender EN/FR pairing within a section | BLOCK |
| VO-04 | Voice pairs change only at section boundaries | WARN |

---

## Part XIII · Evaluation model

The research framework has ten weighted factors. They do not all become measurable at the same time. Attempting to score all ten on Lesson 1 produces a meaningless number.

### 13.1 Measurable now — single lesson, no cohort

These are design-verifiable. The QA harness scores them directly from the transcript and render.

| Framework factor | How it is scored now | Target |
|---|---|---|
| #8 Process quality | Count of retrieval beats, output beats, input seconds, repair beats | ≥40% of beats are L3+ |
| #5 Communicative quality | Presence of form instruction, pragmatics notes, chunk teaching | ≥1 pragmatics note, ≥1 form note per item |
| #3 Output requirement | Ratio of production beats to copy beats | ≥ 1.0 |
| #2 Input volume | Seconds of connected FR speech | Per DENSITY_TABLE |
| #1 Can-Do design | Goal is a capability statement, transfer task is unrehearsed | Binary pass |
| #10 Motivation design | Personalized scenario present, progress visible, rationale stated | Binary pass |
| #9 Fluency design | Fluency round with decreasing pause multipliers | Binary pass |

**A lesson can score full marks on all seven of these on day one.** This is where the improvement effort goes right now.

### 13.2 Measurable after N lessons — no cohort needed

| Factor | Unlocks at | Instrument |
|---|---|---|
| #6 Spaced recycling | Lesson 4 | Warm-up coverage report: is every prior item resurfacing on schedule? |
| Curriculum coverage | Lesson 5 | Item-to-Can-Do map with no orphans |
| Cumulative gate integrity | Lesson 2 | allowed_set validation across the series |
| Consolidation load | Lesson 5 | First CONSOLIDATION lesson runs clean |

### 13.3 Measurable only with learners and time

| Factor | Wt | Needs | Earliest |
|---|---|---|---|
| #1 Independent proficiency gain | 20 | Independent 4-skill test, T0 + T1 | ~8 weeks |
| #2 Real-world transfer | 15 | Unseen-task scoring by blind assessors | ~8 weeks |
| #3 Long-term retention | 10 | T2 delayed test, 4–8 weeks after T1 | ~14 weeks |
| #4 Learning efficiency | 10 | Time-on-task logs | ~8 weeks |
| #6 Personalization | 8 | App adaptivity + subgroup data | ~12 weeks |
| #7 Engagement/adherence | 8 | Retention curves, dropout, return rate | ~12 weeks |
| #10 Evidence quality | 7 | Comparison group, equal study time | ~16 weeks |

**Roughly 40 of the framework's 100 points are gated on evidence, not design.** A 12-person pilot with a delayed test moves the score from the high 20s to the 50s without changing a single frame of video. It is the cheapest available improvement and should be scheduled in parallel with content production, not after it.

### 13.4 Pilot design (minimum viable)

```
n = 12 learners, true beginners, mixed L1 background

T0   Baseline: 4-skill placement + 2-min spontaneous speaking sample
     + 100-word writing sample. Recorded.

INTERVENTION  Lessons 1–10 over 5 weeks. Log:
     - minutes actually watched
     - app sessions completed
     - production attempts (app ASR)
     - error rate per item

T1   Immediate post-test. UNSEEN situations only.
     Never test on a sentence that appeared in a lesson.

T2   Delayed test at +6 weeks. Equivalent tasks, not identical.

SCORING  Two assessors, blind to condition, on ACTFL-style criteria:
         functions, accuracy, context, text type.

COMPARISON  Matched group using a mainstream app,
            equal logged study time.
```

The most dangerous evaluation error is testing learners on the sentences they practised. Both the current scorecard and the current Leitner box do exactly that. Fixing this is a prerequisite to any meaningful score.

---

## Part XIV · Improvement backlog

Mapped to framework features. Ordered by value ÷ cost.

### Tier 1 — implement in the next lesson, no dependencies

| # | Change | Closes |
|---|---|---|
| 1 | REPAIR beat after every PRODUCE | #7 feedback |
| 2 | COLD INPUT + INPUT RETURN using FR·MAN | #2 input |
| 3 | TRANSFER TASK at L5 | #2 transfer |
| 4 | Can-Do goal framing + Can-Do scorecard | #1 goals |
| 5 | Fluency round with shrinking pauses | #9 automaticity |
| 6 | Support-level tag on every beat | enables X-rules |
| 7 | Pause formula applied throughout | #9 pacing |
| 8 | Personalized MAKE IT YOURS scenario | #10 relevance |
| 9 | Word banks in English, not French | #3 retrieval |

### Tier 2 — needs the app or several lessons

| # | Change | Closes | Blocked on |
|---|---|---|---|
| 10 | Production-cued review at Box 2+ | #3, #6 | ASR scoring |
| 11 | ASR pronunciation scoring with diagnostic feedback | #7 | App build |
| 12 | Warm-up on N−1/N−3/N−7 schedule | #6 | Lesson 4 |
| 13 | Error-weighted warm-up sampling | #6, #8 | App telemetry |
| 14 | Adaptive item scheduling per learner | #8 personalization | App telemetry |
| 15 | CONSOLIDATION lessons every 5th | #6 | Lesson 5 |
| 16 | MILESTONE assessment every 10th | #1, #2, #3 | Lesson 10 |

### Tier 3 — structural, requires a decision

| # | Change | Closes | Note |
|---|---|---|---|
| 17 | Learner-facing pilot with delayed test | #1,2,3,4,10 | Unlocks ~40 framework points |
| 18 | Live sessions for real interaction | #4 interaction | Also mitigates platform authenticity risk |
| 19 | Learner path choice / goal selection | #10 autonomy | Product decision |
| 20 | Community response threads on lesson prompts | #4 interaction | Low cost, high signal |

**#4 (meaningful interaction) is the one framework feature that neither the video nor a flashcard app can close.** It requires either live sessions, learner-to-learner exchange, or a conversational agent. Until one of those exists, the method has a permanent ceiling on that factor. Worth deciding deliberately rather than discovering later.

---

## Part XV · Authoring checklist

Before a transcript goes to render:

```
□  Can-Do statement written as a capability, not a topic
□  Item list ≤ DENSITY_TABLE ceiling for the band
□  allowed_set(n) computed and every FR line validated against it
□  Cold input dialogue written; comprehension question written
□  Every item block has MEET / ECHO / PRODUCE / REPAIR
□  Every item tagged with its terminal support level; all ≥ L3
□  ≥30% of items reach L4; ≥1 beat at L5
□  Frame declared; build ladder has ≥2 TRY-FIRST steps
□  ≥3 MAKE IT YOURS; ≥1 personalized
□  Transfer task situation appears nowhere else in the lesson
□  Fluency round: no new items, multipliers 3.0/2.0/1.4
□  Every pause computed from P(beat), not chosen by feel
□  Every FR line has an explicit rate tag
□  Every MEET, build step, and scenario has a 🖼 directive
□  No French text specified during any L3+ pause
□  Voice assignment validated against VO rules
□  Warm-up pulled per SPACING_SCHEDULE(n)
□  Scorecard asserts capability
□  App handoff names the review window
```

---

## Changelog

**v1.1** — Resolved two internal contradictions found by running the QA harness against the spec: (a) the voice convention was replaced with an explicit pair model, because EN·WOMAN + FR·WOMAN violated the same-gender rule; (b) X-04 monotonicity is now scoped per ladder, and X-07 added so chunk bars at L3+ show English slot labels rather than the French answer, resolving the X-06/I-03 conflict.

**v1.0** — First formal specification. Consolidates the Core Loop, adds the L0–L5 support ladder, the REPAIR beat, cold input / input return, the transfer task, the fluency round, the pause and rate formulas, lesson classes, and the QA rule table. Splits evaluation into design-verifiable (now) and evidence-gated (later).
