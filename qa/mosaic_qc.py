#!/usr/bin/env python3
"""
Mosaic Method — QA harness
Spec: Mosaic_Method_v1.md · Rules: mosaic_rules.yaml

Usage:
  python mosaic_qc.py lesson.md
  python mosaic_qc.py lesson.md --curriculum curriculum.yaml
  python mosaic_qc.py lesson.md --video out.mp4 --json report.json
  python mosaic_qc.py lesson.md --emit-vision-rubric rubric.json

Layers:
  L0  static transcript analysis   (always runs)
  L1  container/technical          (--video, needs ffprobe)
  L2  audio-transcript alignment   (--video --asr, needs faster-whisper)
  L3  visual frame analysis        (--emit-vision-rubric, then run vision pass)
  L4  pedagogical aggregates       (always runs)
"""

from __future__ import annotations  # allow `Beat | None` hints on Python 3.9

import argparse
import json
import os
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass, field, asdict
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("pyyaml required:  pip install pyyaml --break-system-packages")

# ─────────────────────────────────────────────────────────────
# Model
# ─────────────────────────────────────────────────────────────

VOICES = {"EN·MAN", "EN·WOMAN", "FR·WOMAN", "FR·MAN"}
LEVEL_RE = re.compile(r"^L[0-5]$")
RATE_RE = re.compile(r"^\[rate:\s*([a-z_]+)\]\s*", re.I)

BEAT_RE = re.compile(
    r"^\s*(?P<voice>EN·MAN|EN·WOMAN|FR·WOMAN|FR·MAN)\s*"
    r"(?P<tags>(?:\[[^\]]*\]\s*)*)"
    r"→\s*(?P<text>.*)$"
)
PAUSE_RE = re.compile(r"^\s*⏸\s*PAUSE\s*(?P<sec>[\d.]+)\s*s\s*(?P<tags>(?:\[[^\]]*\]\s*)*)$")
VISUAL_RE = re.compile(r"^\s*🖼\s*(?P<text>.+)$")
SEG_RE = re.compile(r"^##\s+(?P<body>.+)$")
STEP_RE = re.compile(r"^###\s+(?P<body>.+)$")
TAG_RE = re.compile(r"\[([^\]]*)\]")


@dataclass
class Beat:
    line: int
    voice: str
    phase: str = ""
    level: int = -1
    rate: str = ""
    text: str = ""
    tags: list = field(default_factory=list)
    pause: float = 0.0
    pause_line: int = 0
    visuals: list = field(default_factory=list)
    segment: str = ""
    stage: str = ""
    step: str = ""

    @property
    def is_fr(self):
        return self.voice.startswith("FR")

    @property
    def is_en(self):
        return self.voice.startswith("EN")

    @property
    def gender(self):
        return "MAN" if self.voice.endswith("MAN") and not self.voice.endswith("WOMAN") else "WOMAN"


@dataclass
class Finding:
    rule: str
    severity: str
    layer: str
    message: str
    line: int = 0
    context: str = ""

    @property
    def gate(self):
        return {"L0": "A", "L4": "A", "L1": "B", "L2": "B", "L3": "B"}.get(self.layer)

    def to_record(self, fixes):
        return {"gate": self.gate, "rule": self.rule, "severity": self.severity,
                "layer": self.layer, "line": self.line, "issue": self.message,
                "evidence": self.context, "suggested_fix": fixes.get(self.rule, "")}


# ─────────────────────────────────────────────────────────────
# French syllable estimation
# ─────────────────────────────────────────────────────────────

FR_VOWELS = set("aeiouyàâäéèêëîïôöùûüÿœæ")


def fr_syllables(text: str) -> int:
    t = text.lower()
    t = re.sub(r"[^a-zà-öø-ÿ'’\s]", " ", t)
    t = t.replace("'", " ").replace("’", " ")
    total = 0
    for word in t.split():
        if not word:
            continue
        groups, prev = 0, False
        for ch in word:
            v = ch in FR_VOWELS
            if v and not prev:
                groups += 1
            prev = v
        if groups > 1:
            if word.endswith("es") and len(word) > 2 and word[-3] not in FR_VOWELS:
                groups -= 1
            elif word.endswith("e") and word[-2] not in FR_VOWELS:
                groups -= 1
        total += max(1, groups)
    return max(1, total)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("’", "'")
    return re.sub(r"\s+", " ", s).strip()


# ─────────────────────────────────────────────────────────────
# Parser
# ─────────────────────────────────────────────────────────────

def parse_transcript(path: Path):
    raw = path.read_text(encoding="utf-8")
    meta, body = {}, raw

    if raw.lstrip().startswith("---"):
        parts = raw.lstrip().split("---", 2)
        if len(parts) >= 3:
            try:
                meta = yaml.safe_load(parts[1]) or {}
            except yaml.YAMLError as e:
                raise SystemExit(f"front matter is not valid YAML: {e}")
            body = parts[2]

    beats, pending_visuals = [], []
    segment = stage = step = ""
    offset = raw.count("\n", 0, raw.index(body)) if body in raw else 0

    for i, line in enumerate(body.splitlines(), start=offset + 1):
        if not line.strip():
            continue

        m = SEG_RE.match(line)
        if m:
            segment = m.group("body").strip()
            stage = _extract_stage(segment)
            step = ""
            pending_visuals = []
            continue

        m = STEP_RE.match(line)
        if m:
            step = m.group("body").strip()
            continue

        m = VISUAL_RE.match(line)
        if m:
            pending_visuals.append(m.group("text").strip())
            continue

        m = PAUSE_RE.match(line)
        if m:
            if beats:
                beats[-1].pause = float(m.group("sec"))
                beats[-1].pause_line = i
                beats[-1].tags += _tags(m.group("tags") or "")
            continue

        m = BEAT_RE.match(line)
        if m:
            tags = _tags(m.group("tags") or "")
            text = m.group("text").strip()
            rate = ""
            rm = RATE_RE.match(text)
            if rm:
                rate = rm.group(1).lower()
                text = text[rm.end():].strip()
            # strip delivery directions like [warm] at start of text
            text = re.sub(r"^\[[^\]]*\]\s*", "", text).strip()

            phase = next((t.upper().replace(" ", "_") for t in tags
                          if t.upper().replace(" ", "_") in RULES["phases"]), "")
            level = next((int(t[1]) for t in tags if LEVEL_RE.match(t)), -1)

            beats.append(Beat(
                line=i, voice=m.group("voice"), phase=phase, level=level,
                rate=rate, text=text, tags=tags,
                visuals=pending_visuals, segment=segment, stage=stage, step=step,
            ))
            pending_visuals = []
            continue

    return meta, beats


def _tags(blob: str):
    return [t.strip() for t in TAG_RE.findall(blob) if t.strip()]


def _extract_stage(header: str) -> str:
    up = header.upper().replace(" ", "_").replace("-", "_")
    for st in RULES["stages"]:
        if st in up:
            return st
    return ""


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def est_audio(text: str, rate: str, cfg) -> float:
    f = cfg["rate_factor"].get(rate or "natural", 1.0)
    return fr_syllables(text) * cfg["syllable_seconds"] * f


def beat_role(b: Beat, nxt: Beat | None, cfg) -> str:
    """Classify a beat's pause for the pause algorithm."""
    tl = [t.lower() for t in b.tags]
    if "written" in tl or ("write" in b.text.lower() and b.is_en):
        return "written"
    if "confirm" in tl:
        return "confirm"
    if b.is_en:
        if any(c in b.text.lower() for c in RULES["approved_cues"]["produce"]):
            return {2: "read_aloud", 3: "produce_meaning",
                    4: "produce_situation", 5: "produce_cold"}.get(b.level, "produce_meaning")
        if b.stage in ("MAKE_IT_YOURS", "TRANSFER_TASK"):
            return "produce_situation" if b.level < 5 else "produce_cold"
        if b.phase == "NOTE" or "note" in b.segment.lower():
            return "note"
        return "en_instruction"
    # FR beat
    if b.stage == "FLUENCY_ROUND":
        return "fluency"
    if b.stage in ("COLD_INPUT", "INPUT_RETURN"):
        return "input"
    if b.level <= 1:
        return "copy"
    return "confirm"


def is_production(role: str) -> bool:
    return role in ("read_aloud", "produce_meaning", "produce_situation",
                    "produce_cold", "written", "fluency")


def has_cue(text: str, kind: str) -> bool:
    t = text.lower()
    return any(c in t for c in RULES["approved_cues"][kind])


def multiword_tokens(text: str, allowed_multi):
    """Return remaining single tokens after greedily removing known multiword items."""
    t = norm(text)
    t = re.sub(r"\s*(?:\.\.\.|…)\s*", "", t)  # rejoin syllable splits: bon... jour → bonjour
    for item in sorted(allowed_multi, key=len, reverse=True):
        t = t.replace(item, " ")
    t = re.sub(r"[^a-z'\- ]", " ", t)  # keep hyphens: dix-sept / peut-être are single tokens
    t = re.sub(r"(?:^|(?<= ))-+|-+(?:(?= )|$)", " ", t)  # but drop stray leading/trailing dashes
    return [w for w in t.split() if w and w != "'" and w != "-"]


# ─────────────────────────────────────────────────────────────
# Layer 0 + Layer 4 checks
# ─────────────────────────────────────────────────────────────

def run_static(meta, beats, curriculum):
    F, cfg = [], RULES["timing"]
    sev = {r["id"]: r["severity"] for r in RULES["rules"]}
    lay = {r["id"]: r["layer"] for r in RULES["rules"]}

    def add(rid, msg, line=0, ctx=""):
        F.append(Finding(rid, sev.get(rid, "WARN"), lay.get(rid, "L0"), msg, line, ctx))

    items = [norm(i) for i in meta.get("items", [])]
    lesson_n = int(meta.get("lesson", 1))

    allowed = set(items)
    # Proper names declared in the lesson (dialogue characters etc.) are not
    # vocabulary to teach, so they are always allowed by V-01 but never taught.
    allowed |= {norm(x) for x in (meta.get("names") or [])}
    if curriculum:
        for k, v in (curriculum.get("lessons") or {}).items():
            if int(k) <= lesson_n:
                allowed |= {norm(x) for x in v}
    prior = set()
    if curriculum:
        for k, v in (curriculum.get("lessons") or {}).items():
            if int(k) < lesson_n:
                prior |= {norm(x) for x in v}
    allowed_multi = {a for a in allowed if " " in a or "'" in a}
    allowed_single = {a for a in allowed if a not in allowed_multi}
    for a in allowed_multi:
        allowed_single |= set(a.replace("'", " ").split())

    # ---------- S-01 stages ----------
    seen = [b.stage for b in beats if b.stage]
    order, last = [], None
    for s in seen:
        if s != last:
            order.append(s)
            last = s
    missing = [s for s in RULES["stages"] if s not in order]
    if missing:
        add("S-01", f"missing stages: {', '.join(missing)}")
    idx = [RULES["stages"].index(s) for s in order if s in RULES["stages"]]
    if idx != sorted(idx):
        add("S-01", f"stages out of order: {' → '.join(order)}")

    # ---------- S-02 item blocks ----------
    blocks = {}
    for b in beats:
        if b.stage == "ITEM_BLOCK":
            key = norm(b.segment.split("·")[-1])
            blocks.setdefault(key, []).append(b)
    for it in items:
        match = next((k for k in blocks if it in k or k in it), None)
        if not match:
            add("S-02", f"no ITEM_BLOCK found for item '{it}'")
            continue
        phases = {b.phase for b in blocks[match]}
        for req in ("MEET", "ECHO", "PRODUCE", "REPAIR"):
            if req not in phases:
                add("S-02", f"item '{it}' missing {req} phase")

    # ---------- S-03 micro-recall spacing ----------
    run, prev_stage = 0, ""
    for b in beats:
        if b.stage == "ITEM_BLOCK" and b.stage != prev_stage:
            run += 1
        if b.stage == "MICRO_RECALL":
            run = 0
        if run > RULES["rules"][2].get("params", {}).get("max_items_between_recall", 3):
            add("S-03", f"{run} item blocks without a MICRO_RECALL", b.line)
            run = 0
        prev_stage = b.stage

    # ---------- S-04/S-05 build steps ----------
    steps = {}
    for b in beats:
        if b.stage == "BUILD_LADDER" and b.step:
            steps.setdefault(b.step, []).append(b)
    try_first = 0
    for name, bs in steps.items():
        fr = [b for b in bs if b.is_fr]
        cue = next((b for b in bs if b.is_en and has_cue(b.text, "produce")), None)
        if not cue:
            add("S-04", f"build step '{name}' has no production cue", bs[0].line)
            continue
        before = [b for b in bs if b.is_fr and b.line < cue.line]
        after = [b for b in bs if b.is_fr and b.line > cue.line]
        if not after:
            add("S-04", f"build step '{name}' has no confirm after the cue", cue.line)
        if not before:
            try_first += 1
        if not fr:
            add("S-04", f"build step '{name}' has no FR line at all", bs[0].line)
    if steps and try_first < 2:
        add("S-05", f"only {try_first} TRY-FIRST build step(s); need 2")
    if not steps:
        add("S-04", "no BUILD_LADDER steps found (use '### step N' sub-headers)")

    # ---------- S-09/S-10 make it yours ----------
    scen = sorted({b.step or b.segment for b in beats if b.stage == "MAKE_IT_YOURS"})
    if len(scen) < 3:
        add("S-09", f"only {len(scen)} MAKE_IT_YOURS scenario(s); need 3")
    miy_text = " ".join(b.text.lower() for b in beats
                        if b.stage == "MAKE_IT_YOURS" and b.is_en)
    if not any(k in miy_text for k in ("your ", "where you", "right now", "you live", "you work")):
        add("S-10", "no personalized MAKE_IT_YOURS scenario detected")

    # ---------- S-11 transfer novelty ----------
    tt = [b for b in beats if b.stage == "TRANSFER_TASK" and b.is_en]
    if not tt:
        add("S-11", "no TRANSFER_TASK stage found")
    else:
        earlier = " ".join(norm(b.text) for b in beats
                           if b.is_en and b.stage != "TRANSFER_TASK"
                           and b.line < tt[0].line)
        for b in tt:
            content = [w for w in norm(b.text).split() if len(w) > 5]
            overlap = [w for w in content if w in earlier]
            if len(overlap) >= 3:
                add("S-11", f"transfer situation reuses earlier wording: {overlap[:4]}", b.line)

    # ---------- S-12 fluency novelty ----------
    first_seen = {}
    for b in beats:
        if b.is_fr:
            for tok in multiword_tokens(b.text, allowed_multi):
                first_seen.setdefault(tok, b.line)
    for b in beats:
        if b.stage == "FLUENCY_ROUND" and b.is_fr:
            for tok in multiword_tokens(b.text, allowed_multi):
                if first_seen.get(tok) == b.line:
                    add("S-12", f"'{tok}' first appears in FLUENCY_ROUND", b.line)

    # ---------- S-13 build before acquire ----------
    acq_line = {}
    for b in beats:
        if b.stage == "ITEM_BLOCK" and b.is_fr:
            k = norm(b.segment.split("·")[-1])
            acq_line.setdefault(k, b.line)
    for b in beats:
        if b.stage in ("BUILD_LADDER", "FRAME_INTRO") and b.is_fr:
            for it in items:
                if it in norm(b.text):
                    a = next((v for k, v in acq_line.items() if it in k or k in it), None)
                    if a is None or a > b.line:
                        add("S-13", f"'{it}' used in BUILD before its ITEM_BLOCK", b.line)

    # ---------- S-14 can-do ----------
    if not any(b.stage == "CAN_DO_GOAL" for b in beats):
        add("S-14", "no CAN_DO_GOAL stage")
    if not any(b.stage == "CAN_DO_CHECK" for b in beats):
        add("S-14", "no CAN_DO_CHECK stage")
    if not meta.get("can_do"):
        add("S-14", "front matter has no can_do statement")

    # ---------- S-15 scorecard framing ----------
    sc = " ".join(b.text.lower() for b in beats if b.stage == "CAN_DO_CHECK" and b.is_en)
    if sc and not any(k in sc for k in ("you can ", "can you ")):
        add("S-15", "scorecard does not assert a capability ('you can …')")

    # ---------- C rules ----------
    for i, b in enumerate(beats):
        nxt = beats[i + 1] if i + 1 < len(beats) else None
        if b.is_en and has_cue(b.text, "copy"):
            if not (nxt and nxt.is_fr):
                add("C-01", "'repeat after me' not followed by an FR model", b.line, b.text[:60])
            if b.level > 1:
                add("C-05", f"copy cue at L{b.level}; copy cues are L0/L1 only", b.line)
        if b.is_en and has_cue(b.text, "produce"):
            prv = beats[i - 1] if i > 0 else None
            if prv and prv.is_fr and b.step and prv.step == b.step and b.pause < 2.0:
                add("C-02", "'your turn' preceded by an FR model in the same step", b.line)
            if b.level >= 0 and b.level < 2:
                add("C-05", f"produce cue at L{b.level}; produce cues are L2+", b.line)
        role = beat_role(b, nxt, cfg)
        if is_production(role) and role not in ("written", "fluency") and b.phase != "REPAIR":
            if not (nxt and nxt.is_fr):
                add("C-03", f"production pause not followed by an FR confirm ({role})", b.line)
        if b.is_en:
            t = b.text.lower()
            for bad in ("say it back", "repeat both", "repeat the whole", "one more time",
                        "again", "one more", "now say"):
                if bad in t and not has_cue(t, "copy") and not has_cue(t, "produce"):
                    add("C-04", f"unapproved cue phrasing: '{bad}'", b.line, b.text[:60])
                    break

    # ---------- V rules ----------
    filler = {norm(f) for f in RULES["forbidden_fr_filler"]}
    for b in beats:
        if not b.is_fr:
            continue
        for tok in multiword_tokens(b.text, allowed_multi):
            if tok in filler and tok not in allowed_single:
                add("V-02", f"forbidden FR filler '{tok}'", b.line, b.text[:60])
            elif tok not in allowed_single:
                add("V-01", f"'{tok}' not in allowed set", b.line, b.text[:60])
        if b.stage == "COLD_INPUT" and curriculum:
            ok = prior | set(items) | {norm(x) for x in (meta.get("names") or [])}
            ok_single = {w for a in ok for w in a.replace("'", " ").split()}
            for tok in multiword_tokens(b.text, allowed_multi):
                if tok not in ok_single:
                    add("V-04", f"COLD_INPUT uses out-of-scope '{tok}'", b.line)

    # ---------- P rules ----------
    prev_long = False
    for i, b in enumerate(beats):
        nxt = beats[i + 1] if i + 1 < len(beats) else None
        role = beat_role(b, nxt, cfg)
        p = b.pause
        if role == "en_instruction" and p > cfg["en_instruction_max"]:
            add("P-01", f"{p}s pause after EN instruction (max {cfg['en_instruction_max']}s)",
                b.pause_line or b.line, b.text[:60])
        if p > 2.5 and not is_production(role):
            add("P-02", f"{p}s pause on a non-production beat ({role})",
                b.pause_line or b.line, b.text[:60])
        if role == "written":
            lo = cfg["written_pause"] - cfg["written_pause_tolerance"]
            hi = cfg["written_pause"] + cfg["written_pause_tolerance"]
            if not (lo <= p <= hi):
                add("P-04", f"written pause {p}s outside {lo}-{hi}s", b.pause_line or b.line)
        elif role == "fluency":
            pas = next((int(t.split(":")[1]) for t in b.tags
                        if t.lower().startswith("fluency:")), None)
            if pas is None:
                add("P-03", "fluency beat has no [fluency: 1|2|3] pass tag",
                    b.pause_line or b.line)
            else:
                mult = cfg["fluency_multipliers"][min(pas, 3) - 1]
                need = mult * est_audio(b.text, "natural", cfg)
                if abs(p - need) > 0.6:
                    add("P-03", f"fluency pass {pas} pause {p}s, expected ≈{need:.1f}s",
                        b.pause_line or b.line)
        elif is_production(role):
            target_text = nxt.text if (nxt and nxt.is_fr) else b.text
            need = max(cfg["pause_floor"][role],
                       cfg["pause_multiplier"][role] * est_audio(target_text, "natural", cfg))
            if p < need - 0.3:
                add("P-03", f"{role} pause {p}s below computed {need:.1f}s",
                    b.pause_line or b.line, b.text[:60])
        if p > 3.0 and role != "written":
            if prev_long:
                add("P-06", f"two consecutive pauses over 3s ({p}s)", b.pause_line or b.line)
            prev_long = True
        elif role != "written":
            prev_long = False

    # ---------- R rules ----------
    exposure, rate_hist = {}, {}
    order_map = {"very_slow": 0, "slow": 1, "natural": 2, "fast": 3}
    INPUT_STAGES = ("COLD_INPUT", "INPUT_RETURN")
    for b in beats:
        if not b.is_fr:
            continue
        if not b.rate:
            add("R-01", "FR line has no [rate: …] tag", b.line, b.text[:60])
            continue
        if b.stage in INPUT_STAGES:
            continue  # connected input is heard at natural speed by design
        key = norm(b.text)
        # Longest match wins so a "très bien" line is credited to "très bien", not "bien".
        item = max((it for it in items if it in key), key=len, default=key)
        exposure[item] = exposure.get(item, 0) + 1
        n = exposure[item]
        if n == 1 and b.rate not in ("slow", "very_slow"):
            add("R-01", f"first utterance of '{item}' at {b.rate}", b.line)
        if "..." in b.text or "…" in b.text:
            if b.rate != "very_slow":
                add("R-02", f"syllable-split line at {b.rate}, must be very_slow", b.line)
        if b.rate == "natural" and n < 3 and b.stage in ("ITEM_BLOCK",):
            add("R-03", f"'{item}' at natural on exposure {n} (need 3)", b.line)
        prevr = rate_hist.get(item)
        if prevr and order_map[b.rate] < order_map[prevr] and b.stage == "ITEM_BLOCK":
            add("R-04", f"'{item}' slowed from {prevr} to {b.rate}", b.line)
        rate_hist[item] = b.rate
        if b.stage in ("CAN_DO_CHECK",) and b.text.count(".") >= 3 and b.rate != "slow":
            add("R-05", f"multi-item recap line at {b.rate}, should be slow", b.line)

    # ---------- X rules ----------
    # Items present in a beat's text, dropping any that is a substring of a longer
    # present item (so "bien" is not credited with a "très bien" beat — both are
    # legit items; the longer, more specific one wins).
    def items_in(text):
        t = norm(text)
        # Whole-word match (boundary excludes letters AND hyphens) so a short item
        # like "un"/"six" is not credited inside "aucun"/"dix-sept". Then drop any
        # item that is a substring of a longer PRESENT item (bien ⊂ très bien).
        present = [it for it in items
                   if re.search(r"(?<![a-z-])" + re.escape(it) + r"(?![a-z-])", t)]
        return [it for it in present if not any(o != it and it in o for o in present)]

    reached = {}
    for b in beats:
        if b.level < 0:
            continue
        for it in items_in(b.text):
            reached[it] = max(reached.get(it, -1), b.level)
    for it in items:
        if reached.get(it, -1) < 3:
            add("X-01", f"'{it}' never reaches L3 (max L{reached.get(it, -1)})")
    l4 = [it for it in items if reached.get(it, -1) >= 4]
    if items and len(l4) / len(items) < 0.30:
        add("X-02", f"only {len(l4)}/{len(items)} items reach L4 (need 30%)")
    if not any(b.level == 5 for b in beats):
        add("X-03", "no beat runs at L5")
    for b in beats:
        if b.stage == "WARM_UP" and 0 <= b.level < 3:
            add("X-05", f"warm-up beat at L{b.level}, must be L3+", b.line)
        if b.level >= 3 and b.visuals:
            for v in b.visuals:
                if _looks_french(v, allowed_multi | allowed_single):
                    add("X-06", f"French text on screen at L{b.level}: {v[:50]}", b.line)
    # Higher L number = LESS support. A drop in level number = support was added back.
    # Monotonicity is checked per LADDER: acquiring an item and later building a new
    # frame around it are separate ladders, so BUILD may legitimately restart at L1.
    LADDER = {"ITEM_BLOCK": "acquire", "MICRO_RECALL": "acquire",
              "FRAME_INTRO": "build", "BUILD_LADDER": "build",
              "MAKE_IT_YOURS": "produce", "TRANSFER_TASK": "produce"}
    per_item_hist = {}
    for b in beats:
        ladder = LADDER.get(b.stage)
        if b.level < 0 or not ladder:
            continue
        for it in items_in(b.text):
            seq = per_item_hist.setdefault((it, ladder), [])
            if seq and b.level < seq[-1]:
                add("X-04", f"'{it}' support increased L{seq[-1]} → L{b.level} "
                            f"within the {ladder} ladder", b.line)
            seq.append(b.level)

    # ---------- I rules ----------
    for b in beats:
        allv = " ".join(b.visuals).upper()
        if b.phase == "MEET" and b.is_fr and not any(
                "WORD CARD" in " ".join(x.visuals).upper()
                for x in beats if x.segment == b.segment):
            add("I-01", f"MEET segment '{b.segment}' has no WORD CARD directive", b.line)
        if ("..." in b.text or "…" in b.text) and b.is_fr:
            seg_v = " ".join(v for x in beats if x.segment == b.segment for v in x.visuals).upper()
            if "SPLIT" not in seg_v:
                add("I-02", "syllable-split beat with no SPLIT SYLLABLES directive", b.line)
    for name, bs in steps.items():
        seg_v = " ".join(v for b in bs for v in b.visuals).upper()
        if "CHUNK" not in seg_v:
            add("I-03", f"build step '{name}' has no CHUNK BAR directive", bs[0].line)
        elif not any(k in seg_v for k in ("HIGHLIGHT", "FLIP", "SLIDE", "MARK", "ANIMAT")):
            add("I-03", f"build step '{name}' chunk bar does not mark the change", bs[0].line)
    flagged_mic = set()
    for i, b in enumerate(beats):
        nxt = beats[i + 1] if i + 1 < len(beats) else None
        if is_production(beat_role(b, nxt, cfg)) and b.segment not in flagged_mic:
            scope = [x for x in beats if x.segment == b.segment
                     and (not b.step or x.step == b.step)]
            seg_v = " ".join(v for x in scope for v in x.visuals).upper()
            if "MIC" not in seg_v:
                add("I-04", f"production pause in '{b.segment}' with no mic indicator", b.line)
                flagged_mic.add(b.segment)
    for b in beats:
        for v in b.visuals:
            if "WORD BANK" in v.upper() and _looks_french(v, allowed_multi | allowed_single):
                add("I-06", f"word bank appears to list French: {v[:60]}", b.line)

    # ---------- VO rules (voice-pair model) ----------
    # Voice pairs are T and P, NOT A and B — A/B are reserved for the two gates.
    # Pair T = EN·MAN + FR·WOMAN (teaching).  Pair P = EN·WOMAN + FR·MAN (practice).
    # Dialogue stages may use both FR voices; EN framing there belongs to pair T.
    PAIR_T_STAGES = {"CAN_DO_GOAL", "ITEM_BLOCK", "FRAME_INTRO", "BUILD_LADDER"}
    PAIR_P_STAGES = {"WARM_UP", "MICRO_RECALL", "MAKE_IT_YOURS",
                     "TRANSFER_TASK", "FLUENCY_ROUND", "CAN_DO_CHECK"}
    DIALOGUE = {"COLD_INPUT", "INPUT_RETURN"}
    EXPECT = {"T": {"EN·MAN", "FR·WOMAN"}, "P": {"EN·WOMAN", "FR·MAN"}}

    for b in beats:
        pair = "T" if b.stage in PAIR_T_STAGES else ("P" if b.stage in PAIR_P_STAGES else None)
        if b.stage in DIALOGUE:
            if b.is_en and b.voice != "EN·MAN":
                add("VO-02", f"dialogue framing uses {b.voice}; use EN·MAN", b.line)
            continue
        if pair and b.voice not in EXPECT[pair]:
            add("VO-01", f"{b.voice} in a pair-{pair} stage ({b.stage}); "
                         f"expected {' or '.join(sorted(EXPECT[pair]))}", b.line)

    seg_voices = {}
    for b in beats:
        if b.stage in DIALOGUE:
            continue
        seg_voices.setdefault(b.segment, set()).add(b.voice)
    for seg, vs in seg_voices.items():
        genders = {v.split("·")[1] for v in vs}
        langs = {v.split("·")[0] for v in vs}
        if len(langs) == 2 and len(genders) == 1:
            add("VO-03", f"section '{seg}' pairs same-gender EN and FR voices: {sorted(vs)}")
        if vs not in (EXPECT["T"], EXPECT["P"]) and len(vs) > 1:
            add("VO-04", f"section '{seg}' mixes voice pairs: {sorted(vs)}")

    return F, {"items": items, "allowed": allowed, "steps": steps, "reached": reached}


def _looks_french(s: str, vocab) -> bool:
    toks = set(re.findall(r"[a-zà-öø-ÿ']+", norm(s)))
    hits = toks & {v for v in vocab if len(v) > 2}
    return len(hits) >= 1 and "ILLUSTRATION" not in s.upper().split(":")[0]


def run_aggregates(meta, beats, ctx):
    F, cfg = [], RULES["timing"]
    sev = {r["id"]: r["severity"] for r in RULES["rules"]}

    def add(rid, msg):
        F.append(Finding(rid, sev.get(rid, "WARN"), "L4", msg))

    roles = []
    for i, b in enumerate(beats):
        nxt = beats[i + 1] if i + 1 < len(beats) else None
        roles.append(beat_role(b, nxt, cfg))

    prod = sum(1 for r in roles if is_production(r))
    copy = sum(1 for r in roles if r == "copy")
    if copy and prod / copy < 1.0:
        add("A-01", f"production:copy ratio {prod}:{copy} = {prod/copy:.2f} (need ≥1.0)")

    leveled = [b for b in beats if b.level >= 0]
    if leveled:
        hi = sum(1 for b in leveled if b.level >= 3)
        if hi / len(leveled) < 0.40:
            add("A-02", f"only {hi}/{len(leveled)} beats at L3+ ({hi/len(leveled):.0%}, need 40%)")
    else:
        add("A-02", "no beats carry a support-level tag")

    inp = sum(est_audio(b.text, b.rate, cfg) for b in beats
              if b.is_fr and b.stage == "COLD_INPUT")
    band = _density_band(meta)
    if band:
        lo, hi = RULES["density"][band]["input_s"]
        if not (lo <= inp <= hi):
            add("A-03", f"cold input ≈{inp:.0f}s, band {band} wants {lo}-{hi}s")
        ilo, ihi = RULES["density"][band]["items"]
        n = len(ctx["items"])
        if not (ilo <= n <= ihi):
            add("A-04", f"{n} items, band {band} wants {ilo}-{ihi}")

    for it in ctx["items"]:
        seg_beats = [b for b in beats if b.stage == "ITEM_BLOCK" and it in norm(b.segment)]
        if seg_beats and not any(b.is_en and len(b.text.split()) > 6 for b in seg_beats):
            add("A-05", f"item '{it}' has no form note")

    if not any("CULTURE" in b.segment.upper() or "NOTE" in b.segment.upper() for b in beats):
        add("A-06", "no culture or pragmatics note found")

    total_pause = sum(b.pause for b in beats)
    total_audio = sum(est_audio(b.text, b.rate, RULES["timing"]) if b.is_fr
                      else len(b.text.split()) / 2.6 for b in beats)
    runtime = total_pause + total_audio
    if runtime:
        ratio = total_pause / runtime
        lo, hi = cfg["total_pause_ratio"]
        if not (lo <= ratio <= hi):
            add("P-05", f"pause ratio {ratio:.0%} outside {lo:.0%}-{hi:.0%}")
    return F, {"runtime_est_s": round(runtime, 1), "pause_s": round(total_pause, 1),
               "production_beats": prod, "copy_beats": copy}


def _density_band(meta):
    lvl = str(meta.get("level", "")).upper()
    n = int(meta.get("lesson", 1))
    if lvl == "A1":
        return "A1_1_5" if n <= 5 else ("A1_6_15" if n <= 15 else "A1_16_30")
    return lvl if lvl in RULES["density"] else None


# ─────────────────────────────────────────────────────────────
# Layer 1 — technical
# ─────────────────────────────────────────────────────────────

def run_technical(video: Path):
    F = []
    sev = {r["id"]: r["severity"] for r in RULES["rules"]}
    t = RULES["technical"]

    def add(rid, msg):
        F.append(Finding(rid, sev.get(rid, "WARN"), "L1", msg))

    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_streams", "-show_format",
             "-of", "json", str(video)],
            capture_output=True, text=True, check=True).stdout
        probe = json.loads(out)
    except Exception as e:
        return [Finding("T-00", "BLOCK", "L1", f"ffprobe failed: {e}")], {}

    v = next((s for s in probe["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in probe["streams"] if s["codec_type"] == "audio"), None)
    info = {}

    if v:
        info["resolution"] = [v.get("width"), v.get("height")]
        if [v.get("width"), v.get("height")] != t["resolution"]:
            add("T-01", f"resolution {v.get('width')}x{v.get('height')}")
        num, den = (v.get("r_frame_rate", "0/1").split("/") + ["1"])[:2]
        fps = float(num) / float(den or 1)
        info["fps"] = round(fps, 3)
        if abs(fps - t["fps"]) > 0.01:
            add("T-02", f"frame rate {fps:.3f}")
        if v.get("codec_name") != t["video_codec"]:
            add("T-03", f"video codec {v.get('codec_name')}")
        br = int(v.get("bit_rate") or 0) / 1e6
        info["video_mbps"] = round(br, 1)
        if br and br < t["video_bitrate_mbps"] * 0.9:
            add("T-03", f"video bitrate {br:.1f} Mbps")
    if a:
        if a.get("codec_name") != t["audio_codec"]:
            add("T-04", f"audio codec {a.get('codec_name')}")
        abr = int(a.get("bit_rate") or 0) / 1000
        info["audio_kbps"] = round(abr)
        if abr and abr < t["audio_bitrate_kbps"] * 0.9:
            add("T-04", f"audio bitrate {abr:.0f} kbps")

    info["duration_s"] = round(float(probe["format"].get("duration", 0)), 1)

    try:
        r = subprocess.run(
            ["ffmpeg", "-nostats", "-i", str(video), "-af",
             "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"],
            capture_output=True, text=True)
        blob = re.search(r"\{[^{}]*input_i[^{}]*\}", r.stderr, re.S)
        if blob:
            ln = json.loads(blob.group(0))
            i_l = float(ln["input_i"])
            tp = float(ln["input_tp"])
            info["lufs"] = i_l
            info["true_peak"] = tp
            if abs(i_l - t["loudness_lufs"]) > t["loudness_tolerance"]:
                add("T-05", f"integrated loudness {i_l} LUFS")
            if tp > t["true_peak_max_dbtp"]:
                add("T-06", f"true peak {tp} dBTP")
    except Exception as e:
        add("T-05", f"loudness measurement failed: {e}")

    return F, info


# ─────────────────────────────────────────────────────────────
# Layer 3 — vision rubric emission
# ─────────────────────────────────────────────────────────────

def emit_vision_rubric(meta, beats, out: Path):
    cues, t = [], 0.0
    cfg = RULES["timing"]
    for b in beats:
        dur = est_audio(b.text, b.rate, cfg) if b.is_fr else len(b.text.split()) / 2.6
        checks = []
        if b.level >= 3:
            checks.append({"rule": "I-05",
                           "ask": "Is any French word or phrase visible anywhere on screen?",
                           "fail_if": "yes"})
        if b.visuals:
            checks.append({"rule": "I-07",
                           "ask": f"Does the frame show: {'; '.join(b.visuals)}?",
                           "fail_if": "no"})
        if b.stage == "BUILD_LADDER":
            checks.append({"rule": "I-03",
                           "ask": "Is the changed chunk visually distinguished from unchanged chunks?",
                           "fail_if": "no"})
        checks.append({"rule": "I-08",
                       "ask": "Is a progress indicator visible?", "fail_if": "no"})
        if checks:
            cues.append({
                "t_start": round(t, 2),
                "t_mid": round(t + dur / 2, 2),
                "pause_mid": round(t + dur + b.pause / 2, 2),
                "line": b.line, "stage": b.stage, "level": b.level,
                "voice": b.voice, "text": b.text[:80], "checks": checks,
            })
        t += dur + b.pause
    out.write_text(json.dumps(
        {"lesson": meta.get("lesson"), "estimated_runtime_s": round(t, 1), "cues": cues},
        ensure_ascii=False, indent=2), encoding="utf-8")
    return len(cues)


# ─────────────────────────────────────────────────────────────
# Report
# ─────────────────────────────────────────────────────────────

def report(findings, stats, meta):
    by = {"BLOCK": [], "WARN": [], "INFO": []}
    for f in findings:
        by.setdefault(f.severity, []).append(f)
    W = 78
    print("═" * W)
    print(f" SAY IT QA · lesson {meta.get('lesson', '?')} · "
          f"{meta.get('language', '?')} {meta.get('level', '?')} · "
          f"{meta.get('class', 'STANDARD')}")
    print("═" * W)
    for sv in ("BLOCK", "WARN", "INFO"):
        rows = by.get(sv, [])
        if not rows:
            continue
        print(f"\n{sv}  ({len(rows)})")
        print("─" * W)
        rows.sort(key=lambda f: (f.rule, f.line))
        for f in rows:
            loc = f"L{f.line}" if f.line else "  —"
            print(f"  {f.rule:<6} {loc:>6}  {f.message}")
            if f.context:
                print(f"{'':>15}“{f.context}”")
    print("\n" + "─" * W)
    for k, v in stats.items():
        print(f"  {k:<22} {v}")
    print("─" * W)
    GATE = {"L0": "A", "L4": "A", "L1": "B", "L2": "B", "L3": "B"}
    ga = [f for f in findings if GATE.get(f.layer) == "A"]
    gb = [f for f in findings if GATE.get(f.layer) == "B"]
    ran_b = any(f.layer in ("L1", "L2", "L3") for f in findings) or stats.get("duration_s")

    def verdict(rows, label, action, ran=True):
        if not ran:
            return f"  {label:<22} NOT RUN   (supply --video)"
        nb = sum(1 for f in rows if f.severity == "BLOCK")
        nw = sum(1 for f in rows if f.severity == "WARN")
        state = f"FAIL — {action}" if nb else ("PASS with warnings" if nw else "PASS")
        return f"  {label:<22} {state}   ({nb} block, {nw} warn)"

    print(verdict(ga, "GATE A · pre-render", "do not render"))
    print(verdict(gb, "GATE B · post-render", "do not publish", ran_b))
    print("═" * W)
    return 1 if any(f.severity == "BLOCK" for f in findings) else 0


# ─────────────────────────────────────────────────────────────

def main():
    global RULES
    ap = argparse.ArgumentParser()
    ap.add_argument("transcript")
    ap.add_argument("--rules", default=str(Path(__file__).with_name("mosaic_rules.yaml")))
    ap.add_argument("--curriculum")
    ap.add_argument("--video")
    ap.add_argument("--json")
    ap.add_argument("--emit-vision-rubric")
    ap.add_argument("--emit-beats", help="dump parsed beats + estimated timing as JSON (for the generator)")
    ap.add_argument("--promote-lexicon", action="store_true",
                    help="append this lesson's items to the curriculum file, "
                         "but only if Gate A passes")
    args = ap.parse_args()

    RULES = yaml.safe_load(Path(args.rules).read_text(encoding="utf-8"))
    curriculum = yaml.safe_load(Path(args.curriculum).read_text(encoding="utf-8")) \
        if args.curriculum else None

    meta, beats = parse_transcript(Path(args.transcript))
    if not beats:
        sys.exit("no beats parsed — check the transcript format")

    if args.emit_beats:
        cfg = RULES["timing"]
        t = 0.0
        rows = []
        for b in beats:
            dur = est_audio(b.text, b.rate, cfg) if b.is_fr else len(b.text.split()) / 2.6
            rows.append({**asdict(b), "est_audio_s": round(dur, 2),
                         "t_start": round(t, 2), "t_end": round(t + dur, 2),
                         "pause_mid": round(t + dur + b.pause / 2, 2)})
            t += dur + b.pause
        Path(args.emit_beats).write_text(json.dumps(
            {"meta": meta, "beats": rows, "est_runtime_s": round(t, 1)},
            ensure_ascii=False, indent=2), encoding="utf-8")
        if not (args.json or args.video):
            print(f"emitted {len(rows)} beats → {args.emit_beats}")
            return

    findings, ctx = run_static(meta, beats, curriculum)
    agg, stats = run_aggregates(meta, beats, ctx)
    findings += agg
    stats["beats"] = len(beats)
    stats["items"] = len(ctx["items"])
    stats["build_steps"] = len(ctx["steps"])

    if args.video:
        tf, tinfo = run_technical(Path(args.video))
        findings += tf
        stats.update(tinfo)

    if args.emit_vision_rubric:
        n = emit_vision_rubric(meta, beats, Path(args.emit_vision_rubric))
        stats["vision_cues"] = n

    code = report(findings, stats, meta)

    if args.promote_lexicon:
        gate_a_blocked = any(f.severity == "BLOCK" and f.gate == "A" for f in findings)
        if gate_a_blocked:
            print("\n  lexicon NOT promoted — Gate A has blocking findings")
        elif not args.curriculum:
            print("\n  lexicon NOT promoted — no --curriculum file supplied")
        else:
            cp = Path(args.curriculum)
            cur = yaml.safe_load(cp.read_text(encoding="utf-8")) or {}
            cur.setdefault("lessons", {})
            n = int(meta.get("lesson", 0))
            if n in cur["lessons"] or str(n) in cur["lessons"]:
                print(f"\n  lexicon already contains lesson {n} — not overwritten")
            else:
                cur["lessons"][n] = list(meta.get("items", []))
                cp.write_text(yaml.safe_dump(cur, allow_unicode=True,
                                             sort_keys=True), encoding="utf-8")
                print(f"\n  lexicon promoted: {len(meta.get('items', []))} items "
                      f"added for lesson {n}")

    if args.json:
        fixes = {r["id"]: r.get("fix", "") for r in RULES["rules"]}
        Path(args.json).write_text(json.dumps(
            {"video_id": f"lesson_{meta.get('lesson')}", "meta": meta, "stats": stats,
             "findings": [f.to_record(fixes) for f in findings]},
            ensure_ascii=False, indent=2), encoding="utf-8")

    sys.exit(code)


if __name__ == "__main__":
    main()
