# Mosaic — project guide for Claude

Multilingual language-learning videos (Remotion, 4K/30fps). French A1 first.
Lessons are built to the **Mosaic Method** and gated by a two-gate QA system.

## Read these first (do not restate them — follow them)

- **`docs/Mosaic_Method_v1.md`** — the method: 12 stages, Core/Build loops, support
  ladder (L0–L5), `P(beat)` pauses, rate algorithm, voice pairs, density.
- **`docs/Mosaic_QA_System_v1.md`** — the 5 layers + the **transcript grammar (Part II)**.
- **`qa/mosaic_rules.yaml`** — the 77-rule registry (the source of truth for checks).
- **`lessons/golden/lesson_01.md`** — the **reference example**. New lessons match its shape.

## Authoring a lesson (the loop — non-negotiable)

1. Author `lessons/<id>.md` to the Method grammar (front matter; all 12 `## NN · STAGE`
   in order; `### step`/`### scenario`; **`[Ln]` on every beat**, **`[rate:]` on every
   FR beat**, `🖼` on every MEET/build step/scenario). Compute every pause with
   `node scripts/qa/pbeat.mjs` — never choose pauses by feel.
2. Run Gate A: `node scripts/qa/author.mjs <id>` (or `npm run qa:gate-a -- <id>`).
3. **Fix every BLOCK using its `suggested_fix`.** Re-run. Repeat **until exit 0**.
   **Cap at 5 iterations** — if still failing, stop and show the findings.
4. **Never report a lesson done on a non-zero exit code.**
5. **Never sign off a WARN yourself.** List them and stop — a human decides.
6. **Never edit `state/lexicon.json` by hand.** Only a passing Gate A may promote it:
   `node scripts/qa/gate-a.mjs <id> --promote-lexicon` (refuses on any BLOCK / duplicate lesson).

The golden lesson is emitted by `scripts/author-lesson-01.mjs` (content as data,
structure + P(beat) templated) — the pattern to reuse for new lessons.

## The two gates

- **Gate A** (pre-render, blocks render) — `mosaic_qc.py` via `scripts/qa/gate-a.mjs`.
  All 55 L0/L4 rules from the transcript. Exit 1 on any BLOCK.
- **Gate B** (post-render) — `scripts/qa/gate-b.mjs` (+ standalone per-rule scripts).
  14 rules on the rendered mp4: technical (T), P-07, R-06, **I-05** (OCR — no French
  during L3+ retrieval gaps — the reveal/echo pause after a spoken French answer is
  exempt — the highest-consequence check), S-08, I-08; I-07 uses the one vision pass.
  Reads `build/<id>/manifest.json` for exact per-beat timing + tags.

## Non-negotiables (also enforced by the gates)

- FR voices say only `allowed_set(n)` (V-01) and **no filler** — bravo/voilà/parfait
  etc. are forbidden unless taught (V-02).
- No on-screen French at L3+ *during the retrieval gap* (X-06/I-05); the word is
  shown on the spoken reveal (I-16). Instruction vs word registers stay distinct
  (I-15). New-item first utterance is slow (R-01).
- Every item reaches L3, ≥1 beat at L5, monotonic support per ladder (X rules).
- COLD_INPUT and INPUT_RETURN are the identical audio (S-08).

## Where things are

Specs `docs/` · rules+engine `qa/mosaic_*` · gates `scripts/qa/` · golden lesson
`lessons/golden/` · generator tooling `scripts/qa/{pbeat,author}.mjs`,
`mosaic_qc.py --emit-beats` · lexicon `state/lexicon.json` · runtime `build/`,`qa/*.json`
(git-ignored).

## Images (locked)

- **The image style is LOCKED in `scripts/style-lock.mjs`** (`STYLE_DESCRIPTOR` is the
  operative prompt; `STYLE_FULL`/`NEGATIVE` are the source of truth). Modern ligne
  claire, Hergé; rich VARIED palette; flat tones; naturalistic adult anatomy + true-
  to-life skin; no text/signage. Do not change it without the user's say-so.
- **Every image brief is a full SCENE description** — setting, who, what they're
  doing, mood — **never a 1–2 word label**. Enforced: `scripts/images/generate.mjs`
  refuses briefs under 8 words. Registry briefs live in `assets/images/registry.json`.
- Generate: `node --env-file=.env scripts/images/generate.mjs [--only <key>] [--all]`
  (`--all` re-runs every entry, e.g. after a style change).
