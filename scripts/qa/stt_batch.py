#!/usr/bin/env python3
# Batch French transcription for the pronunciation gate. Loads faster-whisper ONCE
# and transcribes every .wav in a directory (the un-slowed clips) -> {file: text}.
#   python stt_batch.py <dir> <lang> [model]
import sys, json, os
d = sys.argv[1]; lang = sys.argv[2] if len(sys.argv) > 2 else "fr"
model = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("WHISPER_MODEL", "base")
from faster_whisper import WhisperModel
m = WhisperModel(model, device="cpu", compute_type="int8")
out = {}
for f in sorted(os.listdir(d)):
    if not f.endswith(".wav"):
        continue
    segs, _ = m.transcribe(os.path.join(d, f), language=None if lang == "auto" else lang, beam_size=1)
    out[f] = " ".join(s.text for s in segs).strip()
print(json.dumps(out))
