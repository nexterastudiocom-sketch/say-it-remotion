# Say It — Transcript Authoring Guide

How to write a lesson transcript the pipeline can turn straight into a 4K film.
Save each lesson as `curriculum/lesson-XX.sent.md`, then run it (see **Running** at the end).

---

## 1. The line format

The whole script is a flat list of **beats**, grouped under `##` segment headers. Two beat types:

```
VOICE  [PHASE]  →  [tag] Spoken text.        ← one audio clip (one ElevenLabs call)
⏸ PAUSE Ns  [PHASE]                          ← silent gap (learner speaks); never sent to the API
```

- `→` is a literal arrow (U+2192). `[PHASE]` and `[tag]` are optional.
- `## Segment title` starts a new segment. Blank lines are ignored.
- A `+0.5s` visual settle is added automatically after every pause — don't add it yourself.

## 2. The four voices

| Label | Role | Voice |
|---|---|---|
| `EN·MAN` | English narrator/coach | man |
| `EN·WOMAN` | English narrator/coach | woman |
| `FR·MAN` | French model voice | man |
| `FR·WOMAN` | French model voice | woman |

IDs live in `.env` (`ELEVENLABS_VOICE_EN_MAN`, `…_EN_WOMAN`, `…_FR_MAN`, `…_FR_WOMAN`).

**Two voice rules:**
1. **Gender contrast** — the French and English voices are never the same gender in the same moment.
2. **Flip only at section boundaries** — a whole teaching stretch uses one pair; a whole practice stretch uses the other. Default: **Teaching = FR woman + EN man**, **Practice = FR man + EN woman**.

## 3. The French-only rule (important)

The **French voice says only taught vocabulary or sentences built from it — nothing else, ever.** No "Voilà," "Exactement," "Bravo, tu as fait…", no filler connector words. A day-one learner can't tell curriculum from filler. The single allowed exception is a bare **"Bravo !"** at the very end. All praise, instruction, and explanation is the **English** voice's job.

**French voice = one voice (woman), always a natural tone.** There is a single French speaker. Do **not** give French lines delivery tags (`[warm]`, `[proud]`, `[bright]`, …) — the pipeline strips them anyway. The only tag French ever takes is **`[slowly]`** for the slow pronunciation pass. English narrators keep their expressive tags.

## 4. Audio tags (Eleven v3)

- A tag directs delivery: `[warm]`, `[playful]`, `[slowly]`, `[gently instructive]`. Put it at the **start** of the text. One or two words max — stacking destabilizes v3.
- **Never use the word "clear"** in a tag — it triggers a throat/"cough" onset on the voice clones. `clearly` and `slowly` are fine; just not bare `clear`. (So `[slowly]` ✅, `[normal pace]` ✅, `[clear, normal pace]` ❌.)
- To slow a word, use `[slowly]` **and** syllable breaks in the text: `Bon... jour.` — v3 reads structure as well as tags.
- Ellipses `…`/`...` inside a line = a micro-pause within one clip (not a separate beat).

## 5. Phases → the corner badge

`[PHASE]` sets the persistent corner badge (big, top-left). Use one of:
`MEET`, `ECHO`, `BUILD`, `MAKE IT YOURS`, `RECALL`, `RECAP`. It holds until the next phase.

## 6. Segment headers the pipeline recognizes

The title text is matched loosely (case-insensitive). Use these forms:

| Header | Becomes | Notes |
|---|---|---|
| `## Opening …` | welcome/method title | free text |
| `## Segment N · GOAL` | lesson title card | |
| `## Segment N · WORD — <french>` | that word's vocab card | **`<french>` must match a workbook vocab word** (its image + card already exist) |
| `## Segment N · QUICK RECALL` | mid-lesson review card | shows the words met so far |
| `## Segment N · BUILD — …` | sentence-builder bar | consecutive BUILD segments merge into one growing sentence |
| `## Segment N · SUBJECT — …` | swap/variation on the builder | |
| `## Segment N · YOUR TURN` | writing card + countdown | put the countdown length in a `⏸ PAUSE Ns` |
| `## Segment N · MODEL` | sample-answer card | |
| `## Segment N · RECAP` | two-column word list | |
| `## Segment N · SUMMARY` | scorecard | |

Words that aren't workbook vocab (e.g. bonsoir, madame) are taught inside BUILD/SUBJECT, not as `WORD —` segments.

## 7. The vocabulary pattern (SOP — every word)

Each new word runs this fixed sequence. The word is heard **4×** (natural, slow, natural-after-tip, confirmation):

```
FR      [MEET]  →  <word>.                    ← 1. natural
⏸ PAUSE 1s [MEET]
EN      [MEET]  →  <english meaning>.         ← 2. meaning
⏸ PAUSE 2s [MEET]
FR      [MEET]  →  [slowly] <syl... la... ble>.   ← 3. slow
⏸ PAUSE 2s [MEET]
EN      [MEET]  →  [gently instructive] <one pronunciation tip>   ← 4. OPTIONAL, only when useful
FR      [MEET]  →  <word>.                     ← 5. natural again
⏸ PAUSE 1s [MEET]
EN      [ECHO]  →  Repeat.                      ← 6. cue, then silence
⏸ PAUSE 4s [ECHO]                               (5s for longer phrases)
FR      [ECHO]  →  <word>.                      ← 7. confirmation
⏸ PAUSE 2s [ECHO]
```

**Tip categories** (step 4, use sparingly — not every word): silent final consonants, nasal vowels, French "R", open/closed vowels, liaison, stress/rhythm, letter combos (eau, oi, eu, gn, ill). Teach the *sound*, not grammar/spelling.

**Review** every 5–8 words as a `QUICK RECALL` segment: FR word → pause (recall English) → next; then EN word → pause (recall French) → FR answer.

## 8. The sentence pattern (SOP — once vocab is built)

Sentences use **no slow pass and no pronunciation tip** — natural speed only:

```
FR  [BUILD]  →  <sentence>.
⏸ PAUSE 2s [BUILD]
EN  [BUILD]  →  <english translation>.        (optional on the growing steps)
FR  [BUILD]  →  <sentence>.
EN  [BUILD]  →  Repeat.
⏸ PAUSE 6s [BUILD]                             (6–8s for sentences)
FR  [BUILD]  →  <sentence>.
⏸ PAUSE 2s [BUILD]
```

For a recall beat: `EN → Now say it in French.` + a 6–8s pause + `FR → <sentence>.`

## 9. Pause lengths (rules of thumb)

Word echo 2s · long phrase echo 3s · "Repeat" silence 4–5s (word) / 6–8s (sentence) · Your Turn 10s · beat/settle 1s.

## 10. Running it

```bash
# 1. write curriculum/lesson-XX.sent.md
# 2. build the base slides from the workbook (once per lesson):
npm run lesson -- XX          # e.g. 1   (structure + locked images)
# 3. parse the transcript + generate audio + bake timings:
node scripts/parse-sent.mjs curriculum/lesson-XX.sent.md lesson-XX
npm run lesson:script          # (for lesson 1, `npm run lesson:sent` does both)
# 4. render:
npx remotion render src/index.ts Lesson-01-FR out/films/Lesson-01-FR.mp4
```

To tweak wording later: edit the `.sent.md`, re-run steps 3–4. Regenerate a dump of exactly
what will be sent with `node --env-file=.env scripts/dump-sent.mjs`.
