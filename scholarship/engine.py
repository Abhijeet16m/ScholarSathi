"""
ScholarSathi eligibility engine.

Student ki profile ko scholarship notices ke rules (JSON) se match karta hai.
Har scholarship ke liye 3 me se ek result deta hai:
    ELIGIBLE      - saare rules pass hue, koi cheez verify karne ko nahi bachi
    NOT ELIGIBLE  - koi rule fail hua
    VERIFY        - rule fail nahi hua, par kuch cheez profile me nahi hai ya
                    student se confirm karwani hai

Kaise chalana hai (terminal me, sirf Python chahiye, kuch install nahi karna):
    python engine.py sample_profile.json azim_premji.json notice2.json notice3.json

Notice files na do to is folder ki saari JSON files (jisme "rules" ho) use hoti hain.
Aaj ki date badalni ho (testing ke liye):
    python engine.py sample_profile.json --today 2026-10-17
"""

import json
import sys
from datetime import date, datetime
from pathlib import Path

# ---------------------------------------------------------------- rules ----

OPS = {
    "==": lambda a, b: a == b,
    "<=": lambda a, b: a <= b,
    ">=": lambda a, b: a >= b,
    "in": lambda a, b: a in b,
}

# Ye document student ka nahi, application ke baad nikalne wala printout hai
GENERATED_DOCS = {"application_form_printout"}


def test(cond, profile):
    """True / False, ya None agar profile me value nahi hai ya compare nahi ho paya."""
    val = profile.get(cond["field"])
    if val is None:
        return None
    try:
        return OPS[cond["operator"]](val, cond["value"])
    except TypeError:
        return None


def check_rule(rule, profile):
    """Return (status, message). status: ok / no / verify / skip."""
    field, op, target = rule["field"], rule["operator"], rule["value"]

    # Kuch rules sirf kisi shart par lagte hain (jaise "sirf OBC par ye income limit")
    cond = rule.get("condition")
    if cond:
        applies = test(cond, profile)
        if applies is False:
            return "skip", f"not applicable ({cond['field']} {cond['operator']} {cond['value']} is false)"
        if applies is None:
            return "verify", (f"'{cond['field']}' is missing from the profile, "
                              f"so it is unknown whether this rule applies")

    val = profile.get(field)
    if val is None:
        return "verify", f"'{field}' is missing from the profile (needs: {op} {target})"

    result = test(rule, profile)
    if result is None:
        return "verify", f"could not compare '{field}' = {val} with {op} {target}"
    if result:
        return "ok", f"{field} = {val} (needs: {op} {target})"
    return "no", f"{field} = {val}, but needs: {op} {target}"


# ------------------------------------------------------------ notice run ----

def parse_date(text):
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def evaluate_notice(notice, profile, today):
    lines = []          # (status, id, message, source_text)
    for rule in notice.get("rules", []):
        status, msg = check_rule(rule, profile)
        lines.append((status, rule["id"], msg, rule.get("source_text", "")))

    # verify_only: code check nahi kar sakta. Student ne profile me True bola
    # to theek, warna "verify karo".
    for item in notice.get("verify_only", []):
        if profile.get(item["field"]) is True:
            lines.append(("ok", item["id"], f"{item['field']} = True (confirmed by the student)",
                          item.get("source_text", "")))
        else:
            lines.append(("verify", item["id"], item["note"], item.get("source_text", "")))

    statuses = [s for s, *_ in lines]
    if "no" in statuses:
        result = "NOT ELIGIBLE"
    elif "verify" in statuses:
        result = "VERIFY"
    else:
        result = "ELIGIBLE"

    last = parse_date(notice.get("last_date"))
    if last is None:
        deadline = "last date unknown"
    elif today > last:
        deadline = f"CLOSED (last date {last.strftime('%d %b %Y')} has passed)"
    else:
        deadline = f"OPEN (last date {last.strftime('%d %b %Y')}, {(last - today).days} days left)"

    return result, deadline, lines


def evaluate_documents(notice, profile):
    have = set(profile.get("documents_have", []))
    missing, maybe, ready = [], [], []
    for doc in notice.get("required_documents", []):
        key = doc.get("doc_key")
        if key in GENERATED_DOCS:
            continue
        keys = [key] + doc.get("alternatives_keys", [])
        if any(k in have for k in keys):
            ready.append(doc["name"])
        elif doc.get("required", True) is True:   # "required" likha na ho to zaroori maano
            missing.append(doc["name"])
        else:
            maybe.append(f"{doc['name']} ({doc['required']})")
    return ready, missing, maybe


# --------------------------------------------------------------- output ----

MARK = {"ok": "[OK]  ", "no": "[NO]  ", "verify": "[??]  ", "skip": "[--]  "}


def print_notice(notice, profile, today):
    result, deadline, lines = evaluate_notice(notice, profile, today)
    name = notice.get("scholarship_name") or "(scholarship name not filled in)"

    print("=" * 70)
    print(name)
    print(f"Result  : {result}")
    print(f"Deadline: {deadline}")
    print("-" * 70)
    for status, rid, msg, _src in lines:
        print(f"  {MARK[status]}{rid:<4} {msg}")

    # Jo rule fail ya verify hue unki asli notice line, taaki student ko "kyo" pata chale
    reasons = [(rid, src) for status, rid, _m, src in lines if status in ("no", "verify") and src]
    if reasons:
        print("\n  What the notice says:")
        for rid, src in reasons:
            print(f"    {rid}: {src}")

    ready, missing, maybe = evaluate_documents(notice, profile)
    print("\n  Documents")
    print(f"    Ready      : {', '.join(ready) if ready else '-'}")
    print(f"    Missing    : {', '.join(missing) if missing else '-'}")
    print(f"    Check      : {', '.join(maybe) if maybe else '-'}")
    print()


# ----------------------------------------------------------------- main ----

def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    today = date.today()
    args = list(argv)
    if "--today" in args:
        i = args.index("--today")
        parsed = parse_date(args[i + 1]) if i + 1 < len(args) else None
        if parsed is None:
            raise SystemExit("Give a date as YYYY-MM-DD after --today, e.g. 2026-10-17")
        today = parsed
        del args[i:i + 2]

    if not args:
        raise SystemExit("Usage: python engine.py <profile.json> [notice1.json notice2.json ...]")

    profile_path, notice_paths = Path(args[0]), [Path(p) for p in args[1:]]
    if not notice_paths:
        notice_paths = [p for p in sorted(Path(".").glob("*.json"))
                        if p.resolve() != profile_path.resolve()]

    notices = []
    for p in notice_paths:
        data = load_json(p)
        if isinstance(data, dict) and "rules" in data:
            notices.append(data)

    if not notices:
        raise SystemExit("No notice JSON found (a file with 'rules' in it).")

    profiles = load_json(profile_path)
    if isinstance(profiles, dict):
        profiles = [profiles]

    for profile in profiles:
        print("#" * 70)
        print(f"# Student: {profile.get('name', '(no name)')}   |   today: {today}")
        print("#" * 70)
        for notice in notices:
            print_notice(notice, profile, today)


if __name__ == "__main__":
    main(sys.argv[1:])
