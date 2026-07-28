# Say It — YouTube Metadata & SEO Spec

Source of truth for every field written by `scripts/youtube/metadata.js`.
Change this file, not the code, when tuning SEO.

---

## Ranking model (why the fields are ordered this way)

For an evergreen course series, discovery comes from three places, roughly in order of
value:

1. **Search** — "learn french for beginners", "french greetings lesson". Won by title,
   description, and **caption text**. Captions are indexed and are the most under-used
   lever available; the transcripts already exist, so this is free ranking signal.
2. **Suggested / next-video** — won by playlist structure and session duration. A viewer
   who finishes Lesson 3 and rolls into Lesson 4 is worth more than a new impression.
3. **Browse** — won by CTR on thumbnail + title.

Optimize in that order. Tags are a weak signal and carry real downside risk (below).

---

## Title

**Cap 100 chars. Target 55–65** — mobile search truncates around 60.

```
{Language} for Beginners #{NN} — {Topic} | Speak {X} Words ({Level})
```

Rules:
- Head keyword in the first 40 characters. Someone typing "french for beginners" must see
  a lexical match before truncation.
- Lesson number always two digits, always in the same position. This is what makes a
  30-video playlist scannable and binge-able.
- One concrete number. "Speak 12 Words" outperforms "Learn Greetings".
- No ALL CAPS, no clickbait brackets, no emoji. This is an education channel; the CTR
  gain is not worth the trust cost.

Examples:
```
French for Beginners #01 — Greetings | Speak 12 Words (A1)      (62)
French for Beginners #03 — Numbers 1–20 | Speak 20 Words (A1)   (60)
Spanish for Beginners #07 — At the Café | Speak 15 Words (A1)   (61)
```

---

## Description (cap 5000)

**The first 150 characters are the only ones most people see.** They appear in search
results and above the "…more" fold. Put the hook and the primary keyword there, and
nothing else.

Template:

```
Learn {Language} by speaking it. In this {Level} lesson you'll say {X} new
{Language} words out loud — not just recognise them.

🃏 Free flashcard practice for this lesson: {APP_URL}

⏱️ CHAPTERS
00:00 Warm-up — what you already know
{...}

🗣️ WORDS YOU'LL SPEAK
{word} — {translation}
{...}

🔁 THE SAY IT METHOD
Every word goes through four steps:
1. Meet — see it, hear it, read the sound
2. Echo — say it out loud
3. Build — grow it into a full sentence, one chunk at a time
4. Make It Yours — write and speak your own sentence

Most courses stop after step 1. That's why you can recognise a hundred words and still
not be able to order a coffee.

▶️ FULL {LANGUAGE} {LEVEL} COURSE: {PLAYLIST_URL}
⏭️ NEXT: {NEXT_URL}
⏮️ PREVIOUS: {PREV_URL}

🔊 Narration uses synthetic voices. Illustrations are AI-assisted.

#Learn{Language} #{Language}ForBeginners #{Language}{Level}
```

Notes:
- The **words list is the highest-value block after the hook.** People search individual
  words and phrases; this is what catches that long tail across 30 lessons.
- Links to next/previous build the session chain. Fill them in on the *previous* lesson
  once the next one is live — the `/publish` command should flag this.
- Max 3 hashtags. The first 3 render above the title; more than 15 and YouTube ignores
  all of them.

---

## Chapters

YouTube only generates chapters if **all** of these hold:
- The first timestamp is exactly `00:00`
- There are at least 3 timestamps
- Every chapter runs at least 10 seconds
- Timestamps ascend

Derive from the lesson JSON section boundaries. **Put the vocabulary in the chapter
titles** — chapter text is indexed and gives a second surface for word-level search:

```
00:00 Warm-up — what you already know
01:30 Meet: bonjour, salut
04:15 Echo: say it out loud
07:40 Build: "Bonjour, madame"
12:05 Make It Yours — your turn
17:20 Speed round
19:10 Recap — all 12 words
```

---

## Tags

**Cap 500 characters total.** ~30–40 tags.

⚠️ **Enforcement risk.** YouTube documents unrelated or misleading tags as a cause of
videos being locked private. That outcome is not appealable — the video has to be
re-uploaded. Do not add high-volume tags that don't describe this specific video.
The upside of a broad tag is small; the downside is losing the video.

Composition:
- 5–8 head terms: `learn french`, `french for beginners`, `french lessons`
- 8–12 mid-tail: `french a1`, `french lesson 3`, `beginner french course`,
  `french speaking practice`
- 10–15 long-tail from *this lesson only*: the actual words, and
  `how to say hello in french`
- 2–3 brand: `say it french`, `say it method`

---

## Structured fields

| Field | Value | Note |
|---|---|---|
| `snippet.categoryId` | `"27"` | Education |
| `snippet.defaultLanguage` | `"en"` | Language of the *metadata* |
| `snippet.defaultAudioLanguage` | `"en"` | Narration is English; target language is content |
| `status.privacyStatus` | `"private"` | Always on insert |
| `status.publishAt` | ISO 8601 | Requires privacy `private` |
| `status.selfDeclaredMadeForKids` | `false` | Required declaration |
| `status.containsSyntheticMedia` | `true` | See below |
| `status.license` | `"youtube"` | |
| `status.embeddable` | `true` | |
| `recordingDetails.recordingDate` | render date | |

**On `containsSyntheticMedia`:** narration is ElevenLabs TTS and illustrations are
generated. Declaring it is the honest call and costs nothing — the disclosure label on
educational content is unremarkable to viewers, while an undisclosed synthetic voice
discovered later is a policy problem.

**`localizations`:** worth adding translated titles and descriptions per channel later.
YouTube serves them by viewer UI language, which opens each course to searches in other
languages. Defer until the base flow is stable.

---

## Thumbnail

1280×720, < 2 MB, per-language accent colour (FR `#2E4FE0`, ES `#E14B3B`, IT `#1FA66B`,
PT `#11998E`, DE `#E0A100`).

Design constraint: **at 210px wide in the sidebar, only about 4 words are readable.**
Show the lesson number and one target-language word — not a sentence. Consistency across
the series matters more than any individual thumbnail; a viewer should recognise a Say It
video before reading the title.

---

## Publishing cadence

Schedule via `publishAt` rather than publishing in batches. Two reasons:
one, a predictable slot trains returning viewers; two, 15 videos appearing at once across
near-identical channels is exactly the pattern that draws inauthentic-content scrutiny.
Render in batches, release on a drip.
