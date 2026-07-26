#!/usr/bin/env python3
"""OCR one or more image files with rapidocr → JSON {path: [boxes]}.
Each box = {text, h, cy, conf} (h = pixel height, so the caller can pick the
prominent caption over small header/footer chrome). Model loads once.

    python ocr.py <img1> [img2 ...]
"""
import sys, json, warnings
warnings.filterwarnings("ignore")

def main():
    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR()
    out = {}
    for p in sys.argv[1:]:
        try:
            res, _ = ocr(p)
        except Exception as e:
            out[p] = {"error": str(e)[:200]}; continue
        boxes = []
        for item in (res or []):
            box, text, conf = item[0], item[1], item[2]
            ys = [pt[1] for pt in box]
            boxes.append({"text": str(text), "h": round(max(ys) - min(ys), 1),
                          "cy": round((max(ys) + min(ys)) / 2, 1), "conf": round(float(conf), 3)})
        out[p] = boxes
    print(json.dumps(out))

if __name__ == "__main__":
    main()
