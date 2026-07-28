#!/usr/bin/env python3
# Frame analysis for the SH gate. Given extracted PNGs, returns JSON:
#   gapFrenchHit  — any allowed French word OCR'd in the GAP frame (SH-03 violation)
#   gapAnimated   — the two GAP frames differ enough to read as motion (SH-04)
#   loopMatch     — the open and close frames are compositionally close (SH-05)
#
#   python frames_check.py <gap1> <gap2> <open> <close> <gapOCR> -- <allowed words...>
import sys, json

def load(p):
    from PIL import Image
    return Image.open(p).convert('RGB').resize((216, 384))

def changed_fraction(a, b, thr=60):
    # fraction of pixels that changed appreciably — robust to a small moving region
    # (a countdown ring + digit) that a whole-frame MEAN would wash out.
    pa, pb = list(a.getdata()), list(b.getdata())
    ch = sum(1 for x, y in zip(pa, pb) if abs(x[0]-y[0])+abs(x[1]-y[1])+abs(x[2]-y[2]) > thr)
    return ch / len(pa)

args = sys.argv[1:]
sep = args.index('--')
gap1, gap2, open_, close_, gapOCR = args[:sep][:5]
allowed = [w.lower() for w in args[sep+1:] if len(w) >= 2]

out = {'gapFrenchHit': None, 'gapAnimated': None, 'loopMatch': None}
try:
    out['gapAnimated'] = changed_fraction(load(gap1), load(gap2)) > 0.002  # any real motion
    out['loopMatch'] = changed_fraction(load(open_), load(close_)) < 0.03  # open ≈ close
except Exception as e:
    out['error'] = f'diff: {e}'

# OCR the GAP frame for any French allowed-word (like I-05)
try:
    import unicodedata
    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR()
    res, _ = ocr(gapOCR)
    text = ' '.join(b[1] for b in (res or [])).lower()
    text = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    hit = next((w for w in allowed if f' {w} ' in f' {text} ' or text.startswith(w+' ') or text.endswith(' '+w)), None)
    out['gapFrenchHit'] = hit
except Exception as e:
    out['gapFrenchHit'] = None
    out['ocrError'] = f'{e}'

print(json.dumps(out))
