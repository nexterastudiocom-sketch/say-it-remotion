# Lesson 1 — Dire bonjour (Saying Hello)
### Core Lesson · Unit 1 · Full production voice script — Revision 2

**New words:** 12 · **A1 progress after this lesson:** 12 / 235

---

## How to read this script

Four voices, alternated by gender at section boundaries — same system as before:

- **NARRATOR (EN · MAN)** / **NARRATOR (EN · WOMAN)** — the English host. Route each line to the matching English ElevenLabs voice ID.
- **FRENCH VOICE (FR · MAN)** / **FRENCH VOICE (FR · WOMAN)** — the model voice. Everything the learner is meant to say comes from here. Route each line to the matching French voice ID.

Rules: French and English are never the same gender at the same moment. The pair flips only at section boundaries (marked with a 🎙️ banner), never mid-section.

**What changed in this revision, based on your notes:**

- **Narrator lines are cut down hard.** Anything that wasn't directly meaning, usage, or a prompt — trivia, asides, "why this matters" reflection — is gone. Teaching sections now just teach.
- **Every beat has an explicit 🖼 ON-SCREEN cue.** Not a transcript of what's said — just the image and the key text/labels that should actually appear. Where the narrator is categorizing something (like the four method steps), those category words now show on screen as he names them, instead of only being spoken.
- **The opening visual is a greeting scene, not a generic explainer graphic** — a match for the lesson's actual content, not a numbered step-by-step slide.
- **Confirm lines no longer restate the word** (no more "Bonjour. Voilà."). They're a standalone "Voilà !" so nothing sounds jammed against the word before it.
- **Pause-to-next-line transitions:** every ⏸ PAUSE is followed by a brief visual settle (about half a second) before the next clip cuts in. Never trigger the next line the instant the pause timer hits zero — that's the "no gap" problem from your notes. This is a video-timeline edit note, not something spoken.
- **Word cards now explicitly hold on screen for the full length of their pause**, so the on-screen word always matches what's being echoed.

Markup key: *[bracketed italics]* = Eleven v3 audio tag (start of line, one or two max). Ellipses inside a line = micro-pause within one clip. ⏸ PAUSE — Ns = silent gap in the Remotion timeline, never sent to ElevenLabs. 🖼 = on-screen visual/text cue.

### Production notes (unchanged)

- Eleven v3 (GA since Feb 2026) powers the audio tags. It does **not** support SSML breaks — that's why pauses live in the timeline, not the audio text.
- If a voice is a Professional Voice Clone, test one segment on v3 before committing the whole lesson — Multilingual v2 is the fallback if it's unstable (supports `<break time="x.xs"/>`, no audio tags).
- Generate each quoted line as its own API call.

| Block | Segments | Type | French voice | English voice |
|---|---|---|---|---|
| 1 | Opening → Segment 7 | Teaching | Woman | Man |
| 2 | Segment 7b · Quick Recall | Practice | Man | Woman |
| 3 | Segments 8–11 · Build / Subject | Teaching | Woman | Man |
| 4 | Segments 12–13 · Your Turn / Model | Practice | Man | Woman |
| 5 | Segments 14–15 · pardon, à bientôt | Teaching | Woman | Man |
| 6 | Segments 16–17 · Recap / Summary | Practice | Man | Woman |

---

## Opening — welcome & method

> 🎙️ **VOICE PAIR A — TEACHING** · French voice = Woman · English voice = Man

🖼 **ON-SCREEN:** Warm greeting scene — two people meeting on a sunlit street, one mid-wave, a small "Bonjour !" speech-bubble accent. A greeting lesson opens on a greeting, not a generic intro slide.

**NARRATOR (EN · MAN)** *[warmly, welcoming]*
"Welcome to Say It French — the course where you don't just hear French, you speak it. Starting right now."

🖼 **ON-SCREEN:** Four labels appear one at a time, left to right, each with a small icon, timed to land as each word is spoken: MEET (spark) → ECHO (speech bubble) → BUILD (blocks) → MAKE IT YOURS (pencil). All four stay on screen together once named.

**NARRATOR (EN · MAN)** *[warm, clear]*
"Every lesson follows four steps: Meet a word, Echo it back out loud, Build it into a sentence, Make It Yours by writing your own. Let's start."

⏸ PAUSE — 1s

---

## Segment 1 · GOAL

🖼 **ON-SCREEN:** Title card — "Leçon 1 : Dire bonjour" / "Lesson 1: Saying Hello" — over the greeting visual. Progress bar at 0/235.

**NARRATOR (EN · MAN)** *[bright]*
"Today's goal: greet someone in French — hello, goodbye, please, thank you."

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Aujourd'hui, tu vas saluer quelqu'un en français."

**NARRATOR (EN · MAN)**
"Let's meet your first word."

---

## Segment 2 · WORD — bonjour

🖼 **ON-SCREEN:** Word card — "bonjour" (large, FR) / "hello, good morning" (EN) / "bohn-ZHOOR" — appears now, holds through the full segment. Background: person waving in morning light.

**NARRATOR (EN · MAN)** *[curious, warm]*
"The most useful word in French."

**FRENCH VOICE (FR · WOMAN)** *[bright, clear]*
"Bonjour… bonjour."

**NARRATOR (EN · MAN)**
"Hello, or good morning. Say it with me."

⏸ PAUSE — 3s — *learner echoes "bonjour" — word card holds*

**FRENCH VOICE (FR · WOMAN)** *[pleased]*
"Voilà !"

🖼 **ON-SCREEN:** Word card mic-icon pulses once — a visual "again" cue, no narrator line needed.

**FRENCH VOICE (FR · WOMAN)** *[bright]*
"Bonjour."

⏸ PAUSE — 3s — *learner echoes "bonjour" again — word card still holding*

---

## Segment 3 · WORD — salut

🖼 **ON-SCREEN:** Word card — "salut" / "hi, bye (informal)" / "sah-LU". Background: two friends greeting casually.

**NARRATOR (EN · MAN)** *[playful]*
"The casual version — for friends, not your boss."

**FRENCH VOICE (FR · WOMAN)** *[light, friendly]*
"Salut… salut."

**NARRATOR (EN · MAN)**
"Hi, or bye. Same word, both directions. Your turn."

⏸ PAUSE — 3s — *learner echoes "salut" — word card holds*

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Exactement !"

🖼 **ON-SCREEN:** Mic-icon pulse.

**FRENCH VOICE (FR · WOMAN)** *[light, warm]*
"Salut !"

⏸ PAUSE — 3s — *learner echoes "salut" again*

---

## Segment 4 · WORD — merci

🖼 **ON-SCREEN:** Word card — "merci" / "thank you" / "mehr-SEE". Background: hand lightly on chest, warm smile.

**NARRATOR (EN · MAN)** *[warm, sincere]*
"A word you'll use constantly."

**FRENCH VOICE (FR · WOMAN)** *[warm, clear]*
"Merci… merci."

**NARRATOR (EN · MAN)**
"Thank you — often said with a hand on the chest. Say it now."

⏸ PAUSE — 3s — *learner echoes "merci" — word card holds*

**FRENCH VOICE (FR · WOMAN)** *[pleased]*
"Très bien !"

🖼 **ON-SCREEN:** Mic-icon pulse.

**FRENCH VOICE (FR · WOMAN)** *[warm, sincere]*
"Merci."

⏸ PAUSE — 3s — *learner echoes "merci" again*

---

## Segment 5 · WORD — s'il vous plaît

🖼 **ON-SCREEN:** Word card — "s'il vous plaît" / "please" / "seel voo PLEH". Background: polite open-hand gesture.

**NARRATOR (EN · MAN)** *[gently, encouraging]*
"Longer word — we'll take it slow."

**FRENCH VOICE (FR · WOMAN)** *[clear, unhurried]*
"S'il vous plaît… s'il vous plaît."

**NARRATOR (EN · MAN)**
"Please — literally closer to 'if it pleases you.' Try it, nice and slow."

⏸ PAUSE — 4s — *learner echoes "s'il vous plaît" — word card holds (longer phrase, extra beat)*

**FRENCH VOICE (FR · WOMAN)** *[encouraging]*
"Bien joué !"

🖼 **ON-SCREEN:** Mic-icon pulse.

**FRENCH VOICE (FR · WOMAN)** *[clear, natural pace]*
"S'il vous plaît."

⏸ PAUSE — 4s — *learner echoes "s'il vous plaît" again*

---

## Segment 6 · WORD — oui / non

🖼 **ON-SCREEN:** Split word card — "oui" / "yes" left, "non" / "no" right. Background: split image, nod vs. head-shake.

**NARRATOR (EN · MAN)** *[playful, bright]*
"Two tiny words that answer half your questions."

**FRENCH VOICE (FR · WOMAN)** *[bright]*
"Oui."
*[flatter, plain]*
"Non."

**NARRATOR (EN · MAN)**
"Yes. No. Say them both."

⏸ PAUSE — 4s — *learner echoes "oui… non" — card holds*

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Parfait !"

🖼 **ON-SCREEN:** Mic-icon pulse.

**FRENCH VOICE (FR · WOMAN)** *[playful]*
"Non… oui."

⏸ PAUSE — 4s — *learner echoes "non… oui" (reversed order)*

---

## Segment 7 · WORD — au revoir

🖼 **ON-SCREEN:** Word card — "au revoir" / "goodbye" / "oh ruh-VWAHR". Background: person waving goodbye at a door.

**NARRATOR (EN · MAN)** *[warm]*
"And the word for heading out the door."

**FRENCH VOICE (FR · WOMAN)** *[clear, warm]*
"Au revoir… au revoir."

**NARRATOR (EN · MAN)**
"Goodbye. Your turn."

⏸ PAUSE — 3s — *learner echoes "au revoir" — card holds*

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Voilà !"

🖼 **ON-SCREEN:** Mic-icon pulse.

**FRENCH VOICE (FR · WOMAN)** *[warm, sincere]*
"Au revoir."

⏸ PAUSE — 3s — *learner echoes "au revoir" again*

---

## Segment 7b · QUICK RECALL

> 🎙️ **VOICE PAIR B — PRACTICE** · French voice = Man · English voice = Woman

🖼 **ON-SCREEN:** The six word cards from this block flash briefly in sequence, then fade to a plain "Listen" icon.

**NARRATOR (EN · WOMAN)** *[playful, inviting]*
"Quick check — just listen this time, don't echo. All six words, once."

**FRENCH VOICE (FR · MAN)** *[warm, steady]*
"Bonjour. Salut. Merci. S'il vous plaît. Oui. Non. Au revoir."

**NARRATOR (EN · WOMAN)** *[warm]*
"However many landed — fine, we'll hit them all again at the end. Let's build a sentence."

---

## Segment 8 · BUILD — Bonjour.

> 🎙️ **VOICE PAIR A — TEACHING** · French voice = Woman · English voice = Man

🖼 **ON-SCREEN:** Sentence-builder bar, empty, one open slot. Clean single-word card: "Bonjour."

**NARRATOR (EN · MAN)** *[inviting]*
"Sentences grow one piece at a time. We start here."

**FRENCH VOICE (FR · WOMAN)** *[clear]*
"Bonjour."

**NARRATOR (EN · MAN)**
"Already a complete greeting. Say it."

⏸ PAUSE — 3s — *learner echoes "Bonjour." — sentence-builder bar holds*

---

## Segment 9 · BUILD — Bonjour, madame.

🖼 **ON-SCREEN:** Sentence-builder bar — "Bonjour" slides in, "madame" snaps into a second slot. Card: "madame — ma'am".

**NARRATOR (EN · MAN)** *[bright]*
"Now we add someone to greet."

**FRENCH VOICE (FR · WOMAN)** *[clear]*
"Bonjour, madame."

**NARRATOR (EN · MAN)**
"Hello, ma'am — 'madame' is your polite word for a woman. Say the whole thing."

⏸ PAUSE — 3s — *learner echoes "Bonjour, madame." — bar holds*

---

## Segment 10 · BUILD — Bonjour, madame. Merci !

🖼 **ON-SCREEN:** Sentence-builder bar adds a third slot — "Merci !" snaps in. Full sentence now reads across the bar.

**NARRATOR (EN · MAN)** *[warm]*
"One more piece."

**FRENCH VOICE (FR · WOMAN)** *[clear, warm]*
"Bonjour, madame. Merci !"

**NARRATOR (EN · MAN)**
"Hello, ma'am. Thank you! Try the whole sentence."

⏸ PAUSE — 4s — *learner echoes the full sentence — bar holds*

**FRENCH VOICE (FR · WOMAN)** *[proud]*
"Voilà — ta première phrase !"

🖼 **ON-SCREEN:** Sentence bar pulses gold — "first sentence" badge appears briefly.

**FRENCH VOICE (FR · WOMAN)** *[warm, encouraging]*
"Bonjour, madame. Merci !"

⏸ PAUSE — 5s — *learner echoes the full sentence again*

---

## Segment 11 · SUBJECT — Bonsoir, monsieur.

🖼 **ON-SCREEN:** Sentence-builder bar — "madame" swaps out for "monsieur", "Bonjour" swaps for "Bonsoir" (both highlighted as the changed pieces). New word card: "bonsoir — good evening".

**NARRATOR (EN · MAN)** *[curious, inviting]*
"Now we swap two pieces. First, a new word: bonsoir — good evening. Bonjour's after-dark twin."

**FRENCH VOICE (FR · WOMAN)** *[clear]*
"Bonsoir, monsieur."

**NARRATOR (EN · MAN)**
"Good evening, sir — 'monsieur' is madame's counterpart, for a man. Say the whole thing."

⏸ PAUSE — 4s — *learner echoes "Bonsoir, monsieur." — bar holds, swapped words still highlighted*

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Exactement !"

🖼 **ON-SCREEN:** Mic-icon pulse.

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Bonsoir, monsieur."

⏸ PAUSE — 5s — *learner echoes "Bonsoir, monsieur." again*

---

## Segment 12 · YOUR TURN

> 🎙️ **VOICE PAIR B — PRACTICE** · French voice = Man · English voice = Woman

🖼 **ON-SCREEN:** Writing card + 10-second countdown ring. Small hint chips visible but not read aloud: "bonjour / bonsoir" + "madame / monsieur".

**NARRATOR (EN · WOMAN)** *[encouraging, warm]*
"Your turn. Morning or evening right now? That's your first word. Add madame or monsieur. Say it out loud, and write it down."

**FRENCH VOICE (FR · MAN)** *[gentle, inviting]*
"À toi. Dix secondes."

⏸ PAUSE — 10s — *learner speaks AND writes their own sentence — countdown ring visible*

---

## Segment 13 · MODEL

🖼 **ON-SCREEN:** Sample-answer card, subject words highlighted.

**NARRATOR (EN · WOMAN)** *[warm]*
"Here's one example."

**FRENCH VOICE (FR · MAN)** *[warm, clear]*
"Bonsoir, madame. Merci, au revoir !"

**NARRATOR (EN · WOMAN)**
"Good evening, ma'am. Thank you, goodbye! Give yourself a point for every piece you got right."

---

## Segment 14 · WORD — pardon

> 🎙️ **VOICE PAIR A — TEACHING** · French voice = Woman · English voice = Man

🖼 **ON-SCREEN:** Word card — "pardon" / "excuse me, sorry" / "par-DOHN". Background: gentle bump on the street.

**NARRATOR (EN · MAN)** *[warm, light]*
"One word, two jobs: bumping into someone, or interrupting politely."

**FRENCH VOICE (FR · WOMAN)** *[clear]*
"Pardon… pardon."

**NARRATOR (EN · MAN)**
"Excuse me, or sorry. Your turn."

⏸ PAUSE — 3s — *learner echoes "pardon" — card holds*

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Voilà !"

🖼 **ON-SCREEN:** Mic-icon pulse.

**FRENCH VOICE (FR · WOMAN)** *[quick, apologetic]*
"Pardon !"

⏸ PAUSE — 3s — *learner echoes "pardon" again*

---

## Segment 15 · WORD — à bientôt

🖼 **ON-SCREEN:** Word card — "à bientôt" / "see you soon" / "ah byan-TOH". Background: friend waving, warm light.

**NARRATOR (EN · MAN)** *[warm]*
"A softer goodbye — for someone you'll actually see again."

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"À bientôt… à bientôt."

**NARRATOR (EN · MAN)**
"See you soon. Last echo of the lesson."

⏸ PAUSE — 3s — *learner echoes "à bientôt" — card holds*

**FRENCH VOICE (FR · WOMAN)** *[warm, pleased]*
"Douze mots !"

🖼 **ON-SCREEN:** Mic-icon pulse.

**FRENCH VOICE (FR · WOMAN)** *[warm, sincere]*
"À bientôt."

⏸ PAUSE — 3s — *learner echoes "à bientôt" again*

---

## Segment 16 · RECAP

> 🎙️ **VOICE PAIR B — PRACTICE** · French voice = Man · English voice = Woman

🖼 **ON-SCREEN:** Clean two-column word list, all twelve words, each highlighting in turn as it's said.

**NARRATOR (EN · WOMAN)** *[warm, proud]*
"Everything from today, back to back."

**FRENCH VOICE (FR · MAN)** *[warm, steady, unhurried]*
"Bonjour. Salut. Bonsoir. Au revoir. Merci. S'il vous plaît. Oui. Non. Pardon. Madame. Monsieur. À bientôt."

**NARRATOR (EN · WOMAN)** *[proud]*
"Twelve words — and you said every one of them yourself."

---

## Segment 17 · SUMMARY

🖼 **ON-SCREEN:** Scorecard — "+12 mots · A1 : 12 / 235" — progress bar animates from 0 to 12/235, confetti accent.

**NARRATOR (EN · WOMAN)** *[excited, warm, celebratory]*
"Twelve words in the bank — twelve out of two hundred and thirty-five for A1."

**FRENCH VOICE (FR · MAN)** *[proud, bright]*
"Bravo ! Tu as fait ta première leçon."

**NARRATOR (EN · WOMAN)** *[warm]*
"Bravo — first lesson done. Next time: your name, and how you're doing."

🖼 **ON-SCREEN:** Small preview card — "je m'appelle… et toi ?"

**FRENCH VOICE (FR · MAN)** *[warm, inviting]*
"Je m'appelle… et toi ?"

**NARRATOR (EN · WOMAN)**
"À bientôt."

⏸ PAUSE — 1s

**FRENCH VOICE (FR · MAN)** *[warm, cheerful]*
"À bientôt !"

---

*End of script.*
