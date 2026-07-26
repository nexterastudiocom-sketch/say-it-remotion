#!/usr/bin/env python3
"""One ASR pass over a rendered video, shared by the wpm / pronunciation / av-sync
gates. Decodes the audio ONCE, then:
  - full: word-level transcription (auto language) for pacing + caption alignment
  - windows: re-transcribes each given [start,end] window forcing French, for the
    pronunciation round-trip.

    python asr.py <video> <windows.json>   # windows.json = [{"index":N,"start":s,"end":e}]

Prints {"language","duration","words":[{word,start,end,prob}],
        "segments":[...], "windows":[{"index","text"}]}.
"""
import sys, os, json, warnings
warnings.filterwarnings("ignore")

def main():
    video, windows_path = sys.argv[1], sys.argv[2]
    model_name = os.environ.get("WHISPER_MODEL", "base")
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio
    SR = 16000
    audio = decode_audio(video, sampling_rate=SR)      # decode ONCE
    model = WhisperModel(model_name, device="cpu", compute_type="int8")

    # full pass — word timestamps, language auto-detected
    segs_out, words = [], []
    segments, info = model.transcribe(audio, beam_size=5, word_timestamps=True, vad_filter=False)
    for s in segments:
        segs_out.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()})
        for w in (s.words or []):
            words.append({"word": w.word.strip(), "start": round(w.start, 3),
                          "end": round(w.end, 3), "prob": round(getattr(w, "probability", 0.0), 3)})

    # per-window French transcription (slice the already-decoded audio)
    win_out = []
    try:
        wins = json.load(open(windows_path))
    except Exception:
        wins = []
    for w in wins:
        a = max(0, int(w["start"] * SR)); b = min(len(audio), int(w["end"] * SR))
        if b - a < int(0.1 * SR):
            win_out.append({"index": w["index"], "text": ""}); continue
        segs, _ = model.transcribe(audio[a:b], language="fr", beam_size=5, vad_filter=False)
        win_out.append({"index": w["index"], "text": " ".join(s.text.strip() for s in segs).strip()})

    print(json.dumps({"language": info.language, "duration": round(info.duration, 3),
                      "words": words, "segments": segs_out, "windows": win_out}))

if __name__ == "__main__":
    main()
