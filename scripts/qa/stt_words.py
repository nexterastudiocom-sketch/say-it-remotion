#!/usr/bin/env python3
"""Word-level transcription with faster-whisper → JSON on stdout.

    python stt_words.py <audio-or-video> <lang|auto> [model]

Emits {"language","duration","words":[{word,start,end,prob}],
        "segments":[{start,end,text}]}. Decodes via PyAV (no system ffmpeg).
"""
import sys, os, json, warnings
warnings.filterwarnings("ignore")

def main():
    if len(sys.argv) < 3:
        print("usage: stt_words.py <audio> <lang|auto> [model]", file=sys.stderr); sys.exit(2)
    audio, lang = sys.argv[1], sys.argv[2]
    model_name = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("WHISPER_MODEL", "base")
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        audio, language=None if lang == "auto" else lang,
        beam_size=5, word_timestamps=True, vad_filter=False)
    words, segs = [], []
    for s in segments:
        segs.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()})
        for w in (s.words or []):
            words.append({"word": w.word.strip(), "start": round(w.start, 3),
                          "end": round(w.end, 3), "prob": round(getattr(w, "probability", 0.0), 3)})
    print(json.dumps({"language": info.language, "duration": round(info.duration, 3),
                      "words": words, "segments": segs}))

if __name__ == "__main__":
    main()
