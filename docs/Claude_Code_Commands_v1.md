# Claude Code · command pack

**Purpose:** upgrade an existing Gate A / Gate B QA system and its video generator to the Mosaic Method.
**Assumes:** Gate A, Gate B, `manifest.json` emit, and `state/lexicon.json` already exist in the repo.

Reference files to place in the repo before starting:

```
docs/Mosaic_Method_v1.md          the method spec (v1.1)
docs/Mosaic_QA_System_v1.md       layer + grammar reference
qa/mosaic_rules.yaml              69-rule registry, gate-tagged
qa/mosaic_qc.py                   reference implementation of Gate A
```

Run the commands in order. Do not skip command 0.

---

## Command 0 · Recon

```
Read my existing QA system end to end before writing anything.

Report back, as a table and nothing else:
  1. Where Gate A lives, what it currently checks, and what it reads as input.
  2. Where Gate B lives, what it currently checks, and what it reads.
  3. The exact current schema of manifest.json and state/lexicon.json.
  4. Where the generation loop writes the script text, and whether the
     script survives to disk in a form a checker could read.
  5. Which of these already exist: ffmpeg silencedetect pass, whisper
     word-timestamp pass, French ASR round-trip, frame OCR pass.

Then read docs/Mosaic_Method_v1.md and qa/mosaic_rules.yaml.

Tell me which of the 69 rules my current system ALREADY covers, which are
new, and which conflict with what I have. Do not write code yet.
```

---

## Command 1 · Upgrade Gate A

```
Upgrade Gate A to the full rule registry. Adapt what exists — do not rebuild.

INPUT CHANGE
Gate A currently reads manifest.json. It must now read the lesson
transcript (.md) as its primary input, because the transcript carries the
authoring signals the rules need: support-level tags, rate tags, cue
phrasing, phase tags, and visual directives. Keep the manifest read for
asset and timing rules only.

The transcript grammar is defined in docs/Mosaic_QA_System_v1.md Part II.
Implement the parser to that grammar exactly. Reject any transcript that
does not parse — do not attempt a lenient fallback.

RULES
Load qa/mosaic_rules.yaml at runtime. Do not hardcode rules in Python.
Implement every rule where gate == A (55 rules, layers L0 and L4).
qa/mosaic_qc.py is a working reference implementation — port from it
rather than reimplementing, but keep my existing CLI and file layout.

KEEP my existing curriculum-check. It becomes rule V-01. Its lexicon file
is the source for allowed_set(n) — keep the filename I already use.

LEXICON PROMOTION
This is load-bearing. Newly taught items are appended to the lexicon ONLY
after the lesson passes Gate A with zero BLOCK findings. A failed lesson
must never widen the allowed set, or every later lesson's vocabulary check
is silently poisoned. Add a --promote-lexicon flag that refuses to write
when any Gate A BLOCK is outstanding, and refuses to overwrite a lesson
number already present.

OUTPUT
Write qa/<video-id>.json with one record per finding:
  {gate, rule, severity, layer, line, issue, evidence, suggested_fix}
suggested_fix comes from the `fix` field in mosaic_rules.yaml. This field
is what the authoring agent reads to repair its own output, so it must be
populated, not blank.

Exit 1 on any BLOCK, 0 otherwise.
```

---

## Command 2 · Upgrade Gate B

```
Upgrade Gate B. Adapt the existing ffmpeg and whisper passes.

Gate B stays deterministic. Exactly ONE check in this gate may use a model.
Everything else is measurement. Implement the 14 rules where gate == B in
qa/mosaic_rules.yaml; each rule carries a `method` field telling you which
mechanism to use.

CHANGE 1 — replace vision with OCR for the screen check (rule I-05)
For every beat where the transcript declares level >= 3, sample the frame
at the midpoint of that beat's pause. OCR it. Lowercase, strip accents,
substring-match against allowed_set(n). Any hit is a BLOCK.

This is a string containment test, not a judgment call. Do not send it to a
vision model. It is the highest-consequence check in the system: showing
the French during a retrieval pause destroys the retrieval, and it looks
completely normal in a thumbnail.

CHANGE 2 — replace global wpm with per-beat syllable rate (rule R-06)
My current check flags a lesson-level words-per-minute threshold. Replace
it. Each FR line declares its intended rate tag. Measure actual syllables
per second from whisper word timestamps and compare against the band for
that tag:
  very_slow 1.4-2.4 · slow 2.2-3.4 · natural 3.2-4.6 · fast 4.4-6.0
A lesson-level average hides the failure that matters — a single [rate:
slow] line that ElevenLabs rendered at natural speed. That is the specific
defect I am trying to catch.

CHANGE 3 — measured pause diff (rule P-07)
silencedetect already gives the gap table. Diff every measured silence
against the pause declared in the transcript. Flag deltas over 0.4s.

CHANGE 4 — audio identity (rule S-08)
COLD_INPUT and INPUT_RETURN must be byte-identical audio. Hash and compare.

KEEP the French ASR round-trip. Keep the vision pass ONLY for rule I-07
(does the rendered frame match its 🖼 directive), which genuinely needs
judgment.

Same output schema and same qa/<video-id>.json file as Gate A.
Exit 1 on any BLOCK.

Each check must remain a standalone script I can run on its own.
```

---

## Command 3 · Upgrade the generator

```
Change how lessons are authored. Do not refactor the generation loop beyond
what is listed here.

TRANSCRIPT FORMAT
Lessons are now authored to the grammar in docs/Mosaic_QA_System_v1.md
Part II. Required and non-optional:
  - YAML front matter: lesson, language, level, class, can_do, items, frame
  - '## NN · STAGE_NAME' segments, all twelve stages, in canonical order
  - '### step N' sub-headers inside BUILD_LADDER
  - '### scenario N' sub-headers inside MAKE_IT_YOURS
  - [Ln] support-level tag on EVERY beat
  - [rate: x] tag on EVERY French beat
  - 🖼 directive on every MEET, every build step, every scenario

Missing [Ln] tags silently disable an entire rule family rather than
erroring. Treat a missing level tag as a generation bug, not a warning.

LESSON STRUCTURE
The twelve stages and their algorithms are in docs/Mosaic_Method_v1.md
Part III. Four things are new versus what I generate today:
  - COLD_INPUT and INPUT_RETURN: the same connected dialogue played once
    before teaching and once after, identical audio both times.
  - REPAIR: after every PRODUCE beat, a retry beat with no confirm.
  - TRANSFER_TASK: a situation rehearsed nowhere else in the lesson,
    blank screen, timed.
  - FLUENCY_ROUND: same sentences three passes, pause multipliers
    3.0 then 2.0 then 1.4, no new items.

TIMING
Pauses are computed, never chosen by feel. Use the P(beat) function in
docs/Mosaic_Method_v1.md Part VII. The pause after an English instruction
is at most 1.2s; production pauses scale with the syllable count of what
the learner has to say.

MANIFEST SCHEMA CHANGE
manifest.json must now carry, per segment: support_level, rate_tag, and
the visual directive text. Gate B cannot run I-05 without knowing which
pauses are L3+, and cannot run R-06 without knowing the intended rate.
This is the only change to the manifest emit.

SELF-REPAIR LOOP
After writing a transcript, run Gate A. Read qa/<video-id>.json. Fix every
BLOCK using the suggested_fix field. Re-run. Repeat until exit 0.
Cap at 5 iterations; if still failing, stop and show me the remaining
findings rather than continuing to guess.

Do NOT sign off WARN findings yourself. List them and stop. WARN means a
human decides.
```

---

## Command 4 · Golden lesson

```
Rewrite Lesson 1 (Dire bonjour, 12 items) to full conformance with the
new format. Same 12 items, no additions.

Run Gate A after every draft. Iterate until exit 0 with zero BLOCK.
Then list the remaining WARN findings for me and stop.

Save it as lessons/golden/lesson_01.md and note in the file header that
it is the reference example for all future lesson generation.
```

A conformant example is worth more to a code agent than the prose spec. Generate this before lesson 2.

---

## Command 5 · Persist the loop

```
Write CLAUDE.md at the repo root. It must state:

  - Lessons are authored to docs/Mosaic_Method_v1.md and the grammar in
    docs/Mosaic_QA_System_v1.md Part II.
  - lessons/golden/lesson_01.md is the reference example. Match its shape.
  - After writing any transcript: run Gate A, fix every BLOCK using
    suggested_fix, re-run, repeat until exit 0. Max 5 iterations.
  - Never report a lesson as done on a non-zero exit code.
  - Never sign off a WARN. List them and stop.
  - Never append to the lexicon manually. Only --promote-lexicon does that,
    and only after Gate A passes.

Keep it under one page. Point at the specs, do not restate them.
```

---

## What maps to what

| Your existing | Becomes | Note |
|---|---|---|
| Gate A | Gate A, layers L0 + L4 | 55 rules, was ~1 |
| `curriculum-check` | Rule V-01 | Keep it; it is the vocabulary gate |
| `state/lexicon.json` | `allowed_set(n)` source | Keep the filename; add promotion gating |
| Gate B | Gate B, layers L1 + L2 + L3 | 14 rules |
| silencedetect pass | Rule P-07 | Now diffs against declared pauses |
| whisper wpm pass | Rule R-06 | Now per-beat syllable rate, not lesson wpm |
| frame OCR pass | Rule I-05 | Now the primary screen check |
| French ASR round-trip | Keep as is | Still the pronunciation lever |
| vision pass | Rule I-07 only | Demoted; OCR handles the rest |
| `qa/<video-id>.json` | Unchanged schema | `suggested_fix` now populated |
| manifest emit | + `support_level`, `rate_tag`, `visual` | Only manifest change |

---

## Two things to watch

**Rule count is not progress.** Gate A going from one check to fifty-five means the first real lesson will fail loudly. That is the system working. Expect the first conformant lesson to take several iterations.

**Calibrate before trusting.** The pause floors, the syllable-rate bands, and the 0.4s tolerance are derived from the method spec, not measured against your renders. Run Gate B against two or three videos you have actually watched and tune the thresholds to match what you noticed. Otherwise you get a flood of findings, stop reading them, and the gate becomes decoration.

---

## Command 6 · Image registry and review gate

Run this before Command 4. The golden lesson should be generated with images already resolving.

```
Build an image registry so that every slide has an illustration, the same
word always uses the same illustration, and I approve images before render.

REGISTRY
Create assets/images/registry.json:

  {
    "items": {
      "bonjour": {
        "image_id": "img_fr_bonjour_01",
        "file": "assets/images/items/img_fr_bonjour_01.png",
        "brief": "Person waving in a morning street",
        "status": "pending",
        "first_lesson": 1,
        "approved_at": null
      }
    },
    "scenes": {
      "L01_bakery_counter": { ... same shape, plus "lesson": 1 }
    }
  }

Two classes, two reuse rules:
  items  — keyed by the French item. Reused across EVERY lesson, forever.
           If bonjour has an image from lesson 1, lesson 9's warm-up uses
           that same file. This builds a visual vocabulary the learner
           recognizes, and it is why the key is the item and not the lesson.
  scenes — keyed by lesson and setting. Not reused across lessons.

RESOLUTION AT TRANSFER EMIT
When the transcript emits a WORD CARD for item X, look X up in the registry
and write its image_id. Do not generate. Do not invent a filename.
If X is absent, create a pending entry from the image_brief column in the
lesson workbook, then generate.

Never generate a second image for an item that already has one. bonjour
appears in MEET, ECHO, RECALL, BUILD and RECAP inside one lesson — all five
resolve to one file. A second image for a known item is a bug.

WHAT NEEDS AN IMAGE
  every item                    -> item image, from Items.image_brief
  every Make It Yours scenario  -> scene image
  the culture note              -> scene image
  the cold input dialogue       -> scene image, reused at input return
  the transfer task             -> scene image
Split-syllable cards, chunk bars, progress bars and the scorecard are
typographic. They take no illustration.

GENERATION
Adobe Firefly Custom Model, existing Mosaic style: European clean-line
comic, bold uniform-weight ink outlines, flat solid colour fills, no
gradient shading. Per-language accent colour from the brand spec.

Style consistency is the model's job. Identity consistency is the
registry's job. Do not rely on the prompt to keep bonjour looking like
bonjour across nine lessons — that is what the registry is for.

CONTACT SHEET
After generating, write build/<lesson-id>/contact_sheet.html: one tile per
image showing thumbnail, item or scene name, English gloss, the brief it
was generated from, current status, and every segment it will appear in.

Sort pending first. Mark reused images clearly as "approved in lesson N,
reused" and put them in a collapsed section — I should not re-review an
image I already signed off.

Each tile needs approve and reject controls that write back to
registry.json. Reject takes a one-line note that becomes the regeneration
brief.

GATE A RULES
Implement I-09 through I-13 from qa/mosaic_rules.yaml:
  I-09  every WORD CARD resolves to a registry entry
  I-10  an item maps to exactly one image_id everywhere it appears
  I-11  no image with status other than approved reaches render
  I-12  WordCard mode is image_only at L3 and above
  I-13  every scenario, culture note and dialogue stage has a scene image

I-12 matters and is easy to get backwards. At L3 and above the French word
and the phonetic must disappear, but the ILLUSTRATION stays. The picture
cues the meaning; the learner supplies the French. It is the one visual
that survives the L3 blackout, and it is the reason a retrieval beat is
not just a black screen with a mic icon.

Give WordCard a mode prop: full at L0 and L1, image_only at L3 and above.

GATE B RULE
I-14: perceptual-hash the card region of the rendered frame against the
registry file. Catches the case where the render pipeline resolved a stale
or wrong asset. WARN, not BLOCK.

Do not change the generation loop beyond registry resolution at emit time.
```

### Why the registry rather than prompt consistency

Firefly keeps the *style* consistent — line weight, palette, no shading. It cannot keep the *subject* consistent. Two generations from "person waving in a morning street" give two different people, and the learner reads that as two different words. The registry makes identity a lookup rather than a hope.

The cross-lesson rule is the part worth not weakening. Keying on the item rather than the lesson means `merci` looks identical in lesson 1 and lesson 22, so by the time a learner reaches B1 the images are functioning as a recognition system of their own.
