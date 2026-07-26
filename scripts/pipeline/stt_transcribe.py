#!/usr/bin/env python3
"""Transcribe one audio file with faster-whisper and print the text.

Used by scripts/pipeline/stt.mjs as the local (free, offline) pronunciation
backend. Decodes audio via PyAV (bundled), so NO system ffmpeg is required.

    python stt_transcribe.py <audio-file> <lang> [model]

Prints the transcription to stdout. Model defaults to $WHISPER_MODEL or "base".
"""
import sys
import os
import warnings

warnings.filterwarnings("ignore")  # harmless numpy matmul RuntimeWarning on very short clips

def main():
    if len(sys.argv) < 3:
        print("usage: stt_transcribe.py <audio> <lang> [model]", file=sys.stderr)
        sys.exit(2)
    audio, lang = sys.argv[1], sys.argv[2]
    model_name = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("WHISPER_MODEL", "base")
    from faster_whisper import WhisperModel
    # int8 on CPU — small memory, fast enough for short lesson clips.
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(audio, language=lang, beam_size=5, vad_filter=False)
    print(" ".join(s.text.strip() for s in segments).strip())

if __name__ == "__main__":
    main()
