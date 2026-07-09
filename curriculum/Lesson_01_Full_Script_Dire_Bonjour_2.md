# Lesson 1 — Dire bonjour (Saying Hello)
### Core Lesson · Unit 1 · Full production voice script

**Target runtime:** 16–22 min · **New words:** 12 · **A1 progress after this lesson:** 12 / 235

---

## How to read this script

Four voices now, split by role and alternated by gender:

- **NARRATOR (EN · MAN)** / **NARRATOR (EN · WOMAN)** — your two English hosts. Same script role either way: warm, encouraging, explains what's happening and why. Route each line to the matching English ElevenLabs voice ID.
- **FRENCH VOICE (FR · MAN)** / **FRENCH VOICE (FR · WOMAN)** — your two model voices. Every word, phrase, and sentence the learner is meant to say comes from whichever French voice is active, so learners always hear real, native-modeled French — never English-accented French. Route each line to the matching French voice ID.

**Two rules decide which pair is speaking at any moment:**

1. **Gender contrast, always.** French and English are never the same gender in the same moment — when the French voice is a woman, the English voice is a man, and vice versa. This keeps the two languages instantly distinguishable by ear.
2. **The pair flips at section boundaries only, never mid-section.** Every *teaching* stretch (meeting new words, building sentences) runs entirely on one pair, start to finish. Every *practice* stretch (recall checks, "your turn," recap) runs entirely on the other. So within any single section it's exactly what you asked for — "always one French and one English voice" — and the switch only happens at the seams between sections.

| Block | Segments | Type | French voice | English voice |
|---|---|---|---|---|
| 1 | Opening → Segment 7 | Teaching | Woman | Man |
| 2 | Segment 7b · Quick Recall | Practice | Man | Woman |
| 3 | Segments 8–11 · Build / Subject | Teaching | Woman | Man |
| 4 | Segments 12–13 · Your Turn / Model | Practice | Man | Woman |
| 5 | Segments 14–15 · pardon, à bientôt | Teaching | Woman | Man |
| 6 | Segments 16–17 · Recap / Summary | Practice | Man | Woman |

This exact mapping — teaching = French-woman/English-man, practice = French-man/English-woman — is an arbitrary starting pick. Flip it globally (swap every "Man"/"Woman" in the table) if you'd rather the man carry the teaching sections instead. What matters structurally is the alternation and the gender-contrast rule, not which specific gender does which job.

Three kinds of markup:

- ***[bracketed italics]* before a line** — an Eleven v3 audio tag. Place it at the very start of the text string you send to the API, e.g. `[warmly] Bonjour.` It directs the performance; v3 won't voice the word itself. Keep it to one or two tags per line — stacking more tends to destabilize delivery.
- **Ellipses inside a line** (e.g. "Bonjour… bonjour.") — a natural micro-pause *within* a single audio clip. v3 doesn't support SSML `<break>` tags, so punctuation and line structure are how you get a beat between two words in one generation.
- **⏸ PAUSE — Ns** — a macro-pause *between* clips. This is where the learner talks, so it belongs in your Remotion timeline as a silent gap between the two surrounding audio files — never send it to ElevenLabs as text.

### Production notes (model choice)

- Eleven v3 (general availability since February 2026) is what gives you the audio-tag emotional range this script leans on — that's the feature that makes a voice sound "joyful" or "warm" on command rather than flat.
- v3 does **not** support SSML break tags. That's *why* every pause longer than a beat lives in the Remotion timeline in this script, not in the audio text — it isn't a workaround, it's the only reliable way to do it on v3 regardless.
- If your French or English voice is a Professional Voice Clone, test one full segment on v3 before committing the whole lesson to it — real-world reports are still mixed on PVC stability on v3 versus Multilingual v2, even post-GA. If it's unstable on your specific clone, Multilingual v2 (`<break time="x.xs"/>` up to ~3s, no audio tags) is the safer fallback for the voice lines; you'd then lean on punctuation and delivery pacing instead of bracketed tags for warmth.
- Generate each quoted line as its own API call (matches your existing per-segment pattern) — don't concatenate lines, since the ⏸ pauses need to be edited in as separate timeline gaps between the resulting files.

---

## Opening — welcome & method (new: not in the original beat sheet, but every series needs a first hello)

> 🎙️ **VOICE PAIR A — TEACHING** · French voice = Woman · English voice = Man

**NARRATOR (EN · MAN)** *[warmly, welcoming]*
"Welcome to Say It French — the course where you don't just hear French, you speak it. And I mean starting right now, in this very first lesson."

**NARRATOR (EN · MAN)** *[warm, explaining]*
"Here's how every lesson works, so you know exactly what to expect. Four steps, every time. First, Meet — I'll show you a word: what it means, and how it sounds. Second, Echo — you say it back, out loud, in your own voice. That part is never optional, and it's the whole point of this method: hearing a word is not the same as being able to say it. Third, Build — instead of dumping a whole sentence on you at once, we grow one sentence a single piece at a time, so by the end it feels obvious, not memorized. And fourth, Make It Yours — you write and speak your own sentence, about your own life, not mine."

**NARRATOR (EN · MAN)** *[warm, illustrative]*
"Quick example of what that actually feels like, before we start for real. In a moment, I'll show you the word 'bonjour.' That's Meet. Then I'll go quiet, and you'll say it out loud into the room, even if no one's listening. That's Echo. A little later, we'll turn that single word into a full, real sentence, piece by piece. That's Build. And right near the end, you'll write your own greeting, in your own words. That's Make It Yours. Same four steps, every single lesson, for the whole course."

**NARRATOR (EN · MAN)** *[warm, sincere]*
"Here's why it's built this way. Most people who say 'I've studied French for years but can't speak it' didn't fail at French — they just never practiced the speaking part. They read it, they recognized it, they understood it on a screen. This course closes that specific gap, on purpose, one word at a time."

**NARRATOR (EN · MAN)** *[encouraging, a little playful]*
"No perfect grades, no pressure — just you, your own voice, and twelve words that'll carry you through your very first hello in French. Let's meet them."

⏸ PAUSE — 1s

---

## Segment 1 · GOAL

**NARRATOR (EN · MAN)** *[bright, inviting]*
"Here's today's goal. By the end of this lesson, you'll be able to greet someone in French — hello, goodbye, please, thank you — the handful of words that cover the first ten seconds of almost any conversation, anywhere in the French-speaking world."

**FRENCH VOICE (FR · WOMAN)** *[warm, simple]*
"Aujourd'hui, tu vas saluer quelqu'un en français."

**NARRATOR (EN · MAN)**
"Today, you're going to greet someone in French. Let's meet word number one."

---

## Segment 2 · WORD — bonjour

**NARRATOR (EN · MAN)** *[curious, warm]*
"This is, hands down, the single most useful word in the entire French language. You'll use it more than any other word on this list — walking into a shop, passing a neighbor, starting an email."

**FRENCH VOICE (FR · WOMAN)** *[bright, clear]*
"Bonjour… bonjour."

**NARRATOR (EN · MAN)**
"Bonjour — hello, or good morning. Say it with me, out loud, right now."

⏸ PAUSE — 3s — *learner echoes "bonjour"*

**FRENCH VOICE (FR · WOMAN)** *[pleased, warm]*
"Bonjour. Voilà."

**NARRATOR (EN · MAN)** *[encouraging]*
"One more time, so it really sticks. And here's a small but real fact about French culture: walking into a shop without saying bonjour first can genuinely come across as rude — that's how essential this one word is."

**FRENCH VOICE (FR · WOMAN)** *[bright]*
"Bonjour."

⏸ PAUSE — 3s — *learner echoes "bonjour" again*

---

## Segment 3 · WORD — salut

**NARRATOR (EN · MAN)** *[playful]*
"Next word — the casual version. Save this one for friends, not your boss on the first day."

**FRENCH VOICE (FR · WOMAN)** *[light, friendly]*
"Salut… salut."

**NARRATOR (EN · MAN)**
"Salut — hi, or bye, informal. It works both coming and going, which makes it two words for the price of one. Your turn."

⏸ PAUSE — 3s — *learner echoes "salut"*

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Salut ! Exactement."

**NARRATOR (EN · MAN)** *[light]*
"And once more — this time, imagine you're waving goodbye to a friend as you say it. Same word, completely different moment."

**FRENCH VOICE (FR · WOMAN)** *[light, warm]*
"Salut !"

⏸ PAUSE — 3s — *learner echoes "salut" again*

---

## Segment 4 · WORD — merci

**NARRATOR (EN · MAN)** *[warm, sincere]*
"A word you'll reach for constantly, so let's get it comfortable in your mouth early."

**FRENCH VOICE (FR · WOMAN)** *[warm, clear]*
"Merci… merci."

**NARRATOR (EN · MAN)**
"Merci — thank you. Small tip: French speakers often say it with a hand lightly on the chest — it's a nice, genuine habit to borrow. Say it now."

⏸ PAUSE — 3s — *learner echoes "merci"*

**FRENCH VOICE (FR · WOMAN)** *[pleased]*
"Merci ! Très bien."

**NARRATOR (EN · MAN)** *[warm]*
"Once more, a little warmer this time. Later on, you'll meet 'merci beaucoup' — thank you very much — but for today, this one word already does real work on its own."

**FRENCH VOICE (FR · WOMAN)** *[warm, sincere]*
"Merci."

⏸ PAUSE — 3s — *learner echoes "merci" again*

---

## Segment 5 · WORD — s'il vous plaît

**NARRATOR (EN · MAN)** *[gently, encouraging]*
"This next one's longer, so we'll take it slow — it's worth the extra few seconds."

**FRENCH VOICE (FR · WOMAN)** *[clear, unhurried]*
"S'il vous plaît… s'il vous plaît."

**NARRATOR (EN · MAN)**
"S'il vous plaît — please. Literally, it breaks down closer to 'if it pleases you' — a small window into just how formal and polite this phrase really is under the hood. Give it a try, nice and slow."

⏸ PAUSE — 4s — *learner echoes "s'il vous plaît" (longer phrase, extra beat)*

**FRENCH VOICE (FR · WOMAN)** *[encouraging]*
"S'il vous plaît. Bien joué."

**NARRATOR (EN · MAN)** *[warm]*
"One more pass, at a slightly more natural speed this time. You'll sometimes hear French speakers shorten it in casual speech — but the full version you just learned is always safe, everywhere, with anyone."

**FRENCH VOICE (FR · WOMAN)** *[clear, natural pace]*
"S'il vous plaît."

⏸ PAUSE — 4s — *learner echoes "s'il vous plaît" again*

---

## Segment 6 · WORD — oui / non

**NARRATOR (EN · MAN)** *[playful, bright]*
"Two tiny words, and together they'll answer half the questions you're ever asked."

**FRENCH VOICE (FR · WOMAN)** *[bright]*
"Oui."
*[flatter, plain]*
"Non."

**NARRATOR (EN · MAN)**
"Oui — yes. Non — no. Say them both, in order."

⏸ PAUSE — 4s — *learner echoes "oui… non"*

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Oui, non. Parfait."

**NARRATOR (EN · MAN)** *[playful]*
"Now flip the order — non first, then oui. Small detail worth noticing early: unlike English, French doesn't really use a head-nod or head-shake as a stand-in — you'll actually say the word."

**FRENCH VOICE (FR · WOMAN)** *[playful]*
"Non… oui."

⏸ PAUSE — 4s — *learner echoes "non… oui"*

---

## Segment 7 · WORD — au revoir

**NARRATOR (EN · MAN)** *[warm]*
"And the word you'll need on your way out the door."

**FRENCH VOICE (FR · WOMAN)** *[clear, warm]*
"Au revoir… au revoir."

**NARRATOR (EN · MAN)**
"Au revoir — goodbye. It literally breaks down as 'to the seeing again' — a small built-in promise that you'll meet again, even said to a stranger you'll probably never see. Your turn."

⏸ PAUSE — 3s — *learner echoes "au revoir"*

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Au revoir. Voilà."

**NARRATOR (EN · MAN)** *[warm]*
"One more time, with real warmth, like you mean it."

**FRENCH VOICE (FR · WOMAN)** *[warm, sincere]*
"Au revoir."

⏸ PAUSE — 3s — *learner echoes "au revoir" again*

**NARRATOR (EN · MAN)** *[proud, warm]*
"Six words down. Six real, usable words. Let's see if they've stuck before we move on."

---

## Segment 7b · QUICK RECALL (new: a mid-lesson checkpoint, not in the original beat sheet)

> 🎙️ **VOICE PAIR B — PRACTICE** · French voice = Man · English voice = Woman

**NARRATOR (EN · WOMAN)** *[playful, inviting]*
"Quick challenge — no writing this time, just listening and remembering. I'm going to say all six words you've met so far, once, at a normal pace. See how many come back to you."

**FRENCH VOICE (FR · MAN)** *[warm, steady]*
"Bonjour. Salut. Merci. S'il vous plaît. Oui. Non. Au revoir."

**NARRATOR (EN · WOMAN)** *[warm]*
"However many landed — that's completely fine. This is exactly why we'll circle back to all of them again in the recap at the end. For now, let's keep moving: it's time to turn your very first word into a full sentence."

---

## Segment 8 · BUILD — Bonjour.

> 🎙️ **VOICE PAIR A — TEACHING** · French voice = Woman · English voice = Man

**NARRATOR (EN · MAN)** *[inviting]*
"Time to build. In this method, sentences never arrive whole — they grow, one piece at a time, so nothing ever feels dumped on you. We start right back where we began."

**FRENCH VOICE (FR · WOMAN)** *[clear]*
"Bonjour."

**NARRATOR (EN · MAN)**
"Just that. One word is already a complete, real greeting in French — say it out loud, like you mean it."

⏸ PAUSE — 3s — *learner echoes "Bonjour."*

---

## Segment 9 · BUILD — Bonjour, madame.

**NARRATOR (EN · MAN)** *[bright]*
"Now we add someone to greet — this is how building works, one small piece at a time, never the whole thing at once."

**FRENCH VOICE (FR · WOMAN)** *[clear]*
"Bonjour, madame."

**NARRATOR (EN · MAN)**
"Bonjour, madame — hello, ma'am. 'Madame' is your polite, all-purpose word for a woman — think of it like 'ma'am,' but used far more often in French than in English, even for someone close to your own age. Say the whole thing."

⏸ PAUSE — 3s — *learner echoes "Bonjour, madame."*

---

## Segment 10 · BUILD — Bonjour, madame. Merci !

**NARRATOR (EN · MAN)** *[warm]*
"One more piece, and this one turns it into a real exchange — not just a greeting, but a whole tiny interaction."

**FRENCH VOICE (FR · WOMAN)** *[clear, warm]*
"Bonjour, madame. Merci !"

**NARRATOR (EN · MAN)**
"Hello, ma'am. Thank you! Three words you already knew five minutes ago, now working together as one natural-sounding line. Try the whole sentence, start to finish."

⏸ PAUSE — 4s — *learner echoes the full sentence*

**FRENCH VOICE (FR · WOMAN)** *[proud]*
"Bonjour, madame. Merci ! Voilà ta première phrase."

**NARRATOR (EN · MAN)** *[proud, warm]*
"That's your first real French sentence — built, not memorized. One more time, all the way through, a little more confidently."

**FRENCH VOICE (FR · WOMAN)** *[warm, encouraging]*
"Bonjour, madame. Merci !"

⏸ PAUSE — 5s — *learner echoes the full sentence again*

---

## Segment 11 · SUBJECT — Bonsoir, monsieur.

**NARRATOR (EN · MAN)** *[curious, inviting]*
"Now let's swap two pieces and see what happens to the sentence. First, a brand new word."

**FRENCH VOICE (FR · WOMAN)** *[clear]*
"Bonsoir… bonsoir."

**NARRATOR (EN · MAN)**
"Bonsoir — good evening. Think of it as bonjour's after-dark twin: exactly the same job, different time of day. Roughly once it starts getting dark outside, this is the one native speakers reach for instead."

**FRENCH VOICE (FR · WOMAN)** *[clear]*
"Bonsoir, monsieur."

**NARRATOR (EN · MAN)**
"And 'monsieur' — sir, or Mr. — is madame's counterpart, for a man. So: good evening, sir. Same sentence shape you just built a moment ago, brand new pieces slotted straight into it. Say the whole thing."

⏸ PAUSE — 4s — *learner echoes "Bonsoir, monsieur."*

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Bonsoir, monsieur. Exactement."

**NARRATOR (EN · MAN)** *[warm]*
"Once more — and notice how easy that swap felt. That's the entire trick of this method: you're not learning twelve isolated words, you're learning one flexible sentence shape you can now refill again and again."

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Bonsoir, monsieur."

⏸ PAUSE — 5s — *learner echoes "Bonsoir, monsieur." again*

---

## Segment 12 · YOUR TURN

> 🎙️ **VOICE PAIR B — PRACTICE** · French voice = Man · English voice = Woman

**NARRATOR (EN · WOMAN)** *[encouraging, warm]*
"Now it's entirely yours. First, a quick question: is it morning or evening for you, right now, wherever you're sitting? That decides your first word — bonjour, or bonsoir. Then add madame or monsieur, depending on who you're picturing. If you're stuck, borrow the shape you just practiced and simply swap the two pieces. Say your sentence out loud, and write it down too."

**FRENCH VOICE (FR · MAN)** *[gentle, inviting]*
"À toi. Dix secondes."

⏸ PAUSE — 10s — *learner speaks AND writes their own sentence — on-screen countdown ring*

---

## Segment 13 · MODEL

**NARRATOR (EN · WOMAN)** *[warm]*
"Here's one example — see how close yours landed."

**FRENCH VOICE (FR · MAN)** *[warm, clear]*
"Bonsoir, madame. Merci, au revoir !"

**NARRATOR (EN · WOMAN)**
"Good evening, ma'am. Thank you, goodbye! Four words you already know, doing real work in a real sentence. Give yourself a point for every piece you got right — and if your sentence used bonjour instead of bonsoir, that's still a full, correct sentence, just for a different time of day."

---

## Segment 14 · WORD — pardon

> 🎙️ **VOICE PAIR A — TEACHING** · French voice = Woman · English voice = Man

**NARRATOR (EN · MAN)** *[warm, light]*
"Two last words before we wrap up — starting with the one you'll use constantly, in two completely different situations."

**FRENCH VOICE (FR · WOMAN)** *[clear]*
"Pardon… pardon."

**NARRATOR (EN · MAN)**
"Pardon — excuse me, or sorry. Say it when you gently bump into someone on the street, and say it again when you need to politely interrupt a conversation. Same single word, two different jobs. Your turn."

⏸ PAUSE — 3s — *learner echoes "pardon"*

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"Pardon. Voilà."

**NARRATOR (EN · MAN)** *[light]*
"One more — a little quicker this time, like you really did bump into someone."

**FRENCH VOICE (FR · WOMAN)** *[quick, apologetic]*
"Pardon !"

⏸ PAUSE — 3s — *learner echoes "pardon" again*

---

## Segment 15 · WORD — à bientôt

**NARRATOR (EN · MAN)** *[warm, a little wistful]*
"And a softer way to say goodbye — one that leaves the door open, for someone you know you'll run into again."

**FRENCH VOICE (FR · WOMAN)** *[warm]*
"À bientôt… à bientôt."

**NARRATOR (EN · MAN)**
"À bientôt — see you soon. This is the one for a classmate, a neighbor, a new friend — not a stranger you're never seeing again, which is where plain au revoir belongs instead. Last echo of the lesson — say it out loud."

⏸ PAUSE — 3s — *learner echoes "à bientôt"*

**FRENCH VOICE (FR · WOMAN)** *[warm, pleased]*
"À bientôt. Douze mots."

**NARRATOR (EN · MAN)** *[proud]*
"Twelve words. One more time, warmly, like you're saying it to someone you actually like."

**FRENCH VOICE (FR · WOMAN)** *[warm, sincere]*
"À bientôt."

⏸ PAUSE — 3s — *learner echoes "à bientôt" again*

---

## Segment 16 · RECAP

> 🎙️ **VOICE PAIR B — PRACTICE** · French voice = Man · English voice = Woman

**NARRATOR (EN · WOMAN)** *[warm, proud]*
"Before we close out — everything you picked up today, back to back. Listen for every single word you just said yourself, out loud, over the last few minutes."

**FRENCH VOICE (FR · MAN)** *[warm, steady, unhurried]*
"Bonjour. Salut. Bonsoir. Au revoir. Merci. S'il vous plaît. Oui. Non. Pardon. Madame. Monsieur. À bientôt."

**NARRATOR (EN · WOMAN)** *[proud]*
"Twelve words — and every single one of them, you said out loud, in your own voice, not just mine."

---

## Segment 17 · SUMMARY

**NARRATOR (EN · WOMAN)** *[excited, warm, celebratory]*
"That's twelve new words in the bank — twelve out of two hundred and thirty-five for all of A1. More importantly, think about what you actually just did in the last few minutes: you met new words, echoed every single one of them yourself, built your very first real sentence piece by piece, swapped it to a whole new situation, and then wrote a version that was entirely your own. That's the whole method, start to finish, in one lesson."

**FRENCH VOICE (FR · MAN)** *[proud, bright]*
"Bravo ! Tu as fait ta première leçon."

**NARRATOR (EN · WOMAN)** *[warm]*
"Bravo — you've completed your first lesson. And here's the thing worth sitting with for a second: every lesson from here on builds on exactly what you just did — meet, echo, build, make it yours — so it only gets more natural from here, never harder to start."

**NARRATOR (EN · WOMAN)** *[warm, inviting]*
"Next time, you'll put a name to that hello, ask someone how they're doing, and actually introduce yourself properly. You'll hear one small preview of it right now."

**FRENCH VOICE (FR · MAN)** *[warm, inviting]*
"La prochaine fois : je m'appelle… et toi ?"

**NARRATOR (EN · WOMAN)**
"Next time: my name is… and you? Same method, brand new words. À bientôt."

⏸ PAUSE — 1s

**FRENCH VOICE (FR · MAN)** *[warm, cheerful]*
"À bientôt !"

---

*End of script.*
