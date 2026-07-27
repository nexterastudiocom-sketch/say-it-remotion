# Say It QA System

**Version 1.0** · Enforces `Say_It_Method_v1.md` (v1.1)
Implementation: `say_it_qc.py` · Rule registry: `say_it_rules.yaml`

Every lesson passes through five layers before publication. Layers 0 and 4 run on the transcript alone and gate generation. Layers 1–3 run on the rendered video and gate publication.

---

## Part I · The five layers

| Layer | Runs on | Needs | Gates | Rules |
|---|---|---|---|---|
| **L0** Static transcript | `.md` transcript | nothing | generation | S, C, V, P, R, X, I (authoring half), VO |
| **L1** Technical | `.mp4` | ffprobe, ffmpeg | publication | T-01 … T-08 |
| **L2** Audio alignment | `.mp4` | faster-whisper | publication | P-07, R-06, S-08 |
| **L3** Visual | `.mp4` | vision model | publication | I-05, I-07, I-08 |
| **L4** Pedagogical | transcript | nothing | generation | A-01 … A-06, P-05 |

**L0 is the layer that matters most.** It is deterministic, instant, and catches the failures that are expensive to fix after render. Nothing should reach the renderer with an outstanding `BLOCK` at L0.

### Severity

| | Meaning |
|---|---|
| `BLOCK` | Do not render. Exit code 1. |
| `WARN` | Render permitted, human sign-off required. |
| `INFO` | Logged. No action. |

---

## Part II · Transcript grammar

The parser defines the authoring contract. A transcript that does not match this grammar cannot be checked, and an unchecked transcript does not get rendered.

### 2.1 Front matter — required

```yaml
---
lesson: 4
language: fr
level: A1
class: STANDARD          # CALIBRATION | STANDARD | CONSOLIDATION | MILESTONE
can_do: "I can order a drink and ask the price."
items: [un café, un thé, l'addition, combien]
frame: "[request], [politeness]. [question] ?"
---
```

`items` drives S-02, X-01, X-02, V-01 and A-04. If it is wrong, half the harness is wrong.

### 2.2 Segment headers

```
## 04 · ITEM_BLOCK · bonjour
### step 3
```

`##` opens a **segment**. The stage name must appear in the header and must be one of the twelve canonical stages. Anything after it is a label — for `ITEM_BLOCK` the label is the item, and the parser uses it.

`###` opens a **step** inside a segment. Required for `BUILD_LADDER` (one per build step) and `MAKE_IT_YOURS` (one per scenario). Without steps, S-04, S-05 and S-09 cannot evaluate.

### 2.3 Beats

```
  VOICE  [PHASE] [Ln] [flags] →  [rate: x] text
    ⏸ PAUSE Ns
  🖼 VISUAL DIRECTIVE
```

Concretely:

```
  🖼 WORD CARD — bonjour · [bohn-ZHOOR] · illustration: waving · MIC
  FR·WOMAN [MEET] [L0] → [rate: slow] Bonjour.
    ⏸ PAUSE 1.5s
```

| Element | Rule |
|---|---|
| `VOICE` | `EN·MAN`, `EN·WOMAN`, `FR·WOMAN`, `FR·MAN` — middle dot U+00B7 |
| `[PHASE]` | MEET, ECHO, PRODUCE, REPAIR, RECALL, BUILD, MAKE_IT_YOURS, RECAP, INPUT, NOTE |
| `[Ln]` | L0–L5. **Required on every beat.** Missing tags silently disable the X rules |
| `[rate: x]` | very_slow, slow, natural, fast. **Required on every FR beat** |
| `[confirm]` | marks a model played after a production pause |
| `[written]` | marks a 12s write-it-down pause |
| `[fluency: n]` | pass number 1–3 in FLUENCY_ROUND |
| `⏸ PAUSE Ns` | attaches to the beat directly above it |
| `🖼` | attaches to the beat directly **below** it |

Delivery directions in square brackets at the start of the text (`[warm]`, `[bright]`) are parsed and ignored. They do not need to be removed.

### 2.4 Curriculum file — optional but strongly recommended

```yaml
lessons:
  1: [bonjour, salut, merci, "s'il vous plaît", oui, non, au revoir,
      pardon, "à bientôt", madame, monsieur, bonsoir]
  2: [je, m'appelle, comment, vous, "ça va", bien, "et vous"]
```

Without it, `allowed_set` collapses to the current lesson's own items, and V-01 will flag every legitimate callback to a previous lesson. **Maintain this file.** It is the single input that makes the vocabulary gate real across a series.

---

## Part III · What is checked, layer by layer

### L0 — Static transcript

**Structure (S-01 … S-15)** — all twelve stages present and in order; every item has a complete `MEET → ECHO → PRODUCE → REPAIR` block; micro-recall spacing; build steps well-formed with at least two cold TRY-FIRST steps; at least three distinct Make It Yours scenarios with one personalized; the transfer situation genuinely unrehearsed; no first appearances in the fluency round; nothing used in BUILD before it was acquired; Can-Do stated and re-asked; scorecard asserts capability.

**Cues (C-01 … C-05)** — "repeat after me" always followed by a model *before* the pause; "your turn" never preceded by a model of the target in the same step; every production pause resolved by a confirm; only approved cue phrasing; cue type matches support level. This family exists because the v2 lesson used "Repeat" to mean both *copy me* and *produce alone*, and put the model **after** the silence.

**Vocabulary (V-01 … V-04)** — every FR lemma inside `allowed_set(n)`; the affirmation blocklist enforced separately from the vocabulary list; cold input restricted to `allowed_set(n-1) ∪ new_items`. Syllable splits are rejoined before checking, so `Bon... jour` is read as `bonjour`.

**Pause (P-01 … P-06)** — the pause after an English instruction never exceeds 1.2s; every pause over 2.5s is a production pause; production pauses meet the computed minimum from `P(beat)`; written pauses are 12s ± 2; fluency pauses follow the 3.0 / 2.0 / 1.4 shrink; no stacked dead air.

**Rate (R-01 … R-05)** — every FR beat carries an explicit rate; first utterance of any new item is slow or very_slow; syllable splits are very_slow; no natural rate before the third exposure; rate monotonic within an item. Cold input and input return are exempt — connected input is heard at natural speed by design.

**Support ladder (X-01 … X-07)** — every item reaches L3; 30% reach L4; at least one L5 beat; monotonic support within each ladder; warm-up at L3+; no French on screen at L3+ *during the retrieval gap* (the spoken reveal is shown); chunk bars at L3+ show English slot labels.

**Visual authoring (I-01 … I-04, I-06)** — every MEET has a word card; every split has a split visual; every build step has a chunk bar that *marks the change*; every production pause has a mic indicator; word banks list English.

**Voice (VO-01 … VO-04)** — pair model enforced per stage; no same-gender EN/FR within a section; pairs change only at section boundaries.

### L1 — Technical

3840×2160 · 30fps CFR · H.264 ≥45 Mbps · AAC 384 kbps · −14 LUFS ±1 · true peak ≤ −1.0 dBTP · no dropouts >0.2s inside a voice line · runtime within the density band.

### L2 — Audio alignment

Transcribe the render, align to the transcript, then check three things the transcript cannot promise:

- **P-07** — measured silence matches the specified pause within 0.4s. This is where TTS overrun and renderer rounding show up.
- **R-06** — measured syllables per second falls in the declared rate band. `very_slow` 1.4–2.4, `slow` 2.2–3.4, `natural` 3.2–4.6, `fast` 4.4–6.0. **This is the check that catches "the French is too fast."** A `[rate: slow]` tag that ElevenLabs rendered at 4.1 syl/s is a silent failure at every other layer.
- **S-08** — cold input and input return are byte-identical audio.

### L3 — Visual

`--emit-vision-rubric` writes a cue-point file: timestamp, the beat's text, its support level, and the specific questions to ask a vision model at that frame. Sample the frame at `pause_mid` for retrieval checks and at `t_mid` for directive checks.

- **I-05** — *"Is any French word or phrase visible anywhere on screen?"* asked at every L3+ **retrieval gap** — a pause the learner produces into without having just heard the French (the nearest preceding voiced beat is English). Fail if yes. A pause that *follows* a French beat is the reveal/echo pause and is **exempt** — the answer was just spoken, so the word legitimately stays up. This is the highest-value check in the system and the one most likely to fail silently, because a word card left up from a previous segment looks completely normal in a thumbnail.
- **I-07** — does the frame match its 🖼 directive?
- **I-08** — is the progress indicator present and monotonically increasing?
- **I-15 / I-16** — are the instruction and word registers visually distinct (§4.2 of the Method), and is the answer word shown on screen the moment it is spoken (the reveal)?

### L4 — Pedagogical aggregates

- **A-01** production beats ÷ copy beats ≥ 1.0
- **A-02** ≥40% of beats at L3+
- **A-03** cold input seconds within the density band
- **A-04** item count within the density band
- **A-05** every item has at least one form note
- **A-06** at least one culture or pragmatics note
- **P-05** total pause time 35–50% of runtime

These are the design-verifiable subset of the research evaluation framework. A lesson can score full marks on all of them without any learner data.

---

## Part IV · Running it

```bash
pip install pyyaml --break-system-packages

# authoring loop — run on every save
python say_it_qc.py lesson_04.md --curriculum curriculum.yaml

# pre-render gate
python say_it_qc.py lesson_04.md --curriculum curriculum.yaml --json qa_pre.json
# exit 1 = do not render

# post-render gate
python say_it_qc.py lesson_04.md --curriculum curriculum.yaml \
  --video out/lesson_04.mp4 \
  --emit-vision-rubric out/lesson_04_rubric.json \
  --json qa_post.json
```

Output:

```
BLOCK  (2)
  C-02      L118  'your turn' preceded by an FR model in the same step
  X-06       L94  French text on screen at L4: CHUNK BAR — [ Bonjour ]
WARN   (3)
  P-03      L72  produce_situation pause 3.5s below computed 4.2s
  ...
  VERDICT: FAIL — do not render   (2 block, 3 warn)
```

Exit code is 1 on any BLOCK, 0 otherwise. Wire it into the render pipeline as a hard gate.

---

## Part V · Per-video checklist

Everything that must be true before a video ships.

**Pre-render — L0/L4, automated**

```
□  Front matter complete: lesson, language, level, class, can_do, items, frame
□  Curriculum file updated with this lesson's items
□  Exit code 0 with --curriculum supplied
□  Zero BLOCK findings
□  All WARN findings individually signed off
□  Every FR beat has a [rate:] tag
□  Every beat has an [Ln] tag
□  Build steps use ### sub-headers
□  Make It Yours scenarios use ### sub-headers
```

**Post-render — L1/L2/L3**

```
□  L1 clean: 4K, 30fps, −14 LUFS, no clipping, runtime in band
□  L2 clean: measured pauses within 0.4s; measured rates in band
□  L2: cold input and input return audio identical
□  L3: no French visible at any L3+ pause point   ← highest priority
□  L3: every 🖼 directive matched by the rendered frame
□  L3: build-step chunk bars visibly mark the changed slot
□  L3: progress indicator present and monotonic
```

**Human review — not automatable**

```
□  Illustrations are unambiguous and culturally neutral
□  Form notes are accurate (nasal vowels, liaison, silent letters)
□  Pragmatics notes are accurate and not over-generalized
□  Model answers in Make It Yours are natural, not merely legal
□  Transfer task is genuinely solvable from taught items alone
□  Voice performance matches the delivery directions
```

---

## Part VI · Known gaps

Stated plainly so nobody assumes coverage that does not exist.

| Gap | Why | Mitigation |
|---|---|---|
| Syllable counting is heuristic | No French phonetic dictionary bundled | Validated against A1 vocabulary; add a lexicon for B1+ |
| "Personalized scenario" is keyword-detected | Semantic, not syntactic | S-10 is WARN, not BLOCK; human confirms |
| "Transfer situation is novel" uses word overlap | Semantic paraphrase evades it | Human confirms the transfer task |
| Form-note accuracy unchecked | Requires linguistic knowledge | Human review |
| Illustration appropriateness unchecked | L3 checks presence, not quality | Human review |
| Frame/slot structure not parsed from `frame:` | Would need a slot grammar | S-06/S-07 are WARN |
| No cross-lesson spacing check | Needs a series-level runner | Build once lesson 4 exists |

The last one is the most significant. `SPACING_SCHEDULE(n)` is specified in the method but not yet enforced by anything — it needs a runner that reads lessons 1..n together and verifies that every prior item resurfaces on schedule. Worth building when you have four lessons.
