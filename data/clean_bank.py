import json, re, sys, pathlib

TAG_RE = re.compile(r"<[^>]+>")
ID_NOISE_RE = re.compile(r"^\s*Question ID\b.*?(?=\w|\Z)", re.IGNORECASE)

INLINE_SPLIT_RE = re.compile(r"(?:^|\s)([A-E])[\.\)\]]\s+")

def strip_html(s: str) -> str:
    return TAG_RE.sub("", s or "")

def clean_stem(s: str) -> str:
    s = strip_html(s)
    # remove leading “Question ID …” boilerplate if it exists
    s = ID_NOISE_RE.sub("", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s

def render_template(s, scope):
    if not isinstance(s, str):
        return s
    # very light {{var}} replacement; leave unknowns visible
    def rep(m):
        k = m.group(1).strip()
        return str(scope.get(k, "{{"+k+"}}"))
    return re.sub(r"\{\{\s*([^{}]+?)\s*\}\}", rep, s)

def split_inline_choices(text: str):
    if not text: return []
    text = text.strip()
    labels = []
    for m in INLINE_SPLIT_RE.finditer(text):
        labels.append((m.group(1), m.start(), m.end()))
    if len(labels) < 2:
        return []
    parts = []
    for i,(lab, sidx, eidx) in enumerate(labels):
        start = eidx
        end = labels[i+1][1] if i+1 < len(labels) else len(text)
        parts.append(text[start:end].strip())
    return [p for p in parts if p]

# Recognize many key styles for choices
CHOICE_KEY_PATTERNS = [
    lambda L: L,
    lambda L: L.lower(),
    lambda L: f"choice{L}",
    lambda L: f"choice_{L}",
    lambda L: f"option{L}",
    lambda L: f"option_{L}",
    lambda L: f"opt{L}",
    lambda L: f"{L}_text",
    lambda L: f"{L}Text",
]

ANSWER_FIELDS_LETTER = ["answer","correct","key","answerKey","correctChoice","correctLetter"]
ANSWER_FIELDS_INDEX  = ["answerIndex","correctIndex","keyIndex"]

def collect_choices_from_object(tmpl: dict):
    # direct containers first
    for k in ["choices","options","answers","answerChoices","choiceList","optionsList","choicesInline","allChoicesInline","rawChoices","choicesRaw"]:
        v = tmpl.get(k)
        if isinstance(v, list) and len(v) >= 2:
            return [strip_html(str(x)) for x in v]
        if isinstance(v, str) and v.strip():
            arr = split_inline_choices(strip_html(v))
            if len(arr) >= 2:
                return arr

    # A/B/C/D/E style
    out = []
    for L in ["A","B","C","D","E"]:
        found = None
        for mk in CHOICE_KEY_PATTERNS:
            key = mk(L)
            if key in tmpl and str(tmpl[key]).strip():
                found = strip_html(str(tmpl[key]).strip())
                break
        if found is not None:
            out.append(found)
    if len([x for x in out if x]) >= 2:
        return out
    return None

def guess_answer_index(tmpl: dict, choices: list):
    # explicit index
    for f in ANSWER_FIELDS_INDEX:
        if f in tmpl:
            try:
                idx = int(tmpl[f])
                if 0 <= idx < len(choices): return idx
                # 1-based common mistake
                if 1 <= idx <= len(choices): return idx-1
            except: pass
    # letter key
    for f in ANSWER_FIELDS_LETTER:
        if f in tmpl and str(tmpl[f]).strip():
            val = str(tmpl[f]).strip()
            m = re.match(r"^[A-E]", val, re.I)
            if m:
                return ord(m.group(0).upper()) - ord("A")
            # try exact text match
            try:
                j = choices.index(val)
                return j
            except ValueError:
                pass
    return None

def normalize_item(item: dict):
    out = dict(item)  # keep id/difficulty/domain metadata at top level
    tmpl = dict(item.get("template", {}))

    scope = {}  # if you later want to expand {{params}}, fill this

    stem_raw = tmpl.get("stem", "")
    stem = clean_stem(render_template(str(stem_raw), scope))

    # choices
    choices = collect_choices_from_object(tmpl)
    pulled_from_stem = False
    if not choices:
        # try pulling from inline in stem
        pulled = split_inline_choices(stem)
        if len(pulled) >= 2:
            choices = pulled
            # remove the tail from stem so it’s not duplicated
            # crude: cut off at first "A."/"B." marker
            m = INLINE_SPLIT_RE.search(stem)
            if m:
                stem = stem[:m.start()].rstrip()
            pulled_from_stem = True

    answer_index = None
    if choices:
        answer_index = guess_answer_index(tmpl, choices)
        if answer_index is None and "answer" in tmpl:
            # if answer equals one of the choices by text
            ans_txt = strip_html(str(tmpl["answer"]).strip())
            if ans_txt in choices:
                answer_index = choices.index(ans_txt)

    # build normalized template
    norm = {
        "stem": stem,
    }

    if choices:
        norm["choices"] = choices
        if answer_index is None:
            norm["_needs_manual"] = "missing_correct_index"
        else:
            norm["answerIndex"] = answer_index
    else:
        # treat as numeric/open if no choices can be recovered
        # preserve original answer/distractors if any
        if "answer" in tmpl:
            norm["answer"] = strip_html(str(tmpl["answer"]).strip())
        if "distractors" in tmpl and isinstance(tmpl["distractors"], list):
            norm["distractors"] = [strip_html(str(x)) for x in tmpl["distractors"]]

    # figures
    for k in ["figure","imageUrl","img","diagram","figureUrl"]:
        if tmpl.get(k):
            norm["figure"] = tmpl[k]
            break

    out["template"] = norm
    # status flag for QA
    flags = []
    if not stem or len(stem) < 8: flags.append("short_stem")
    if "choices" in norm:
        if len(norm["choices"]) < 2: flags.append("too_few_choices")
        if "answerIndex" not in norm: flags.append("no_answer_index")
    else:
        if "answer" not in norm: flags.append("no_answer_numeric")
    if flags: out["_lint"] = ",".join(flags)
    return out

def main(inp, outp):
    data = json.load(open(inp, "r", encoding="utf-8"))
    cleaned = []
    issues = []
    for it in data:
        c = normalize_item(it)
        cleaned.append(c)
        if "_lint" in c:
            issues.append((c.get("id","(no id)"), c["_lint"]))
    json.dump(cleaned, open(outp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    report = pathlib.Path(outp).with_suffix(".report.txt")
    with open(report, "w", encoding="utf-8") as f:
        for i,(iid,flag) in enumerate(issues,1):
            f.write(f"{i:04d}\t{iid}\t{flag}\n")
    print(f"Done. Wrote {outp} and {report}. Flagged {len(issues)} items.")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python clean_bank.py input.json output.json")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
