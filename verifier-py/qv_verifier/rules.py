"""Outcome evaluation with exact integers (QV-16 §5.19.3, QV-16-REQ-024).

The semantics follow QV-16 §5.19.3 (and QV-03 §7 for the zero-base case). The JSON shape of
``outcome`` (kinds ``passed`` / ``rejected`` / ``tie`` / ``winners`` / ``no-quorum`` and the
``reason`` / ``tied`` / ``winners`` members) is not defined normatively in any spec; it is
taken from the v1 ``rules.evaluate`` vectors and logged as erratum QV-ERR-PY-003.
"""

from __future__ import annotations

from .errors import QVError


def quorum_met(quorum: dict | None, V: int, roll_size: int) -> bool:
    if quorum is None:
        return True
    if quorum.get("type") == "fraction":
        return V * quorum["den"] >= quorum["num"] * roll_size
    if quorum.get("type") == "count":
        return V >= quorum["n"]
    raise QVError("E_RULES", "unknown quorum type")


def _yes_no(contest: dict, counts: dict, V: int, roll_size: int) -> dict:
    rule = contest["rule"]
    y, n_ = counts.get("yes", 0), counts.get("no", 0)
    basis = rule["basis"]
    base = {"yes+no": y + n_, "counted": V, "roll": roll_size}.get(basis)
    if base is None:
        raise QVError("E_RULES", f"unknown basis {basis!r}")
    if base == 0:
        return {"kind": "rejected", "reason": "no-base"}
    lhs, rhs = y * rule["den"], rule["num"] * base
    passed = lhs > rhs if rule["strict"] else lhs >= rhs
    if passed:
        return {"kind": "passed"}
    if y != n_:
        return {"kind": "rejected"}
    # y == n_: the rule could not decide -> tie_break (QV-16 §5.19.3 item 2, Appendix A.7)
    tb = contest["tie_break"]
    if tb["type"] == "status-quo":
        return {"kind": "passed" if tb["option"] == "yes" else "rejected", "reason": "tie-break"}
    if tb["type"] == "lexicographic":
        return {"kind": "passed" if min("yes", "no") == "yes" else "rejected", "reason": "tie-break"}
    if tb["type"] == "declare-tie":
        return {"kind": "tie", "tied": sorted(["yes", "no"])}
    raise QVError("E_RULES", f"tie_break {tb['type']!r} not supported")


def _multi(contest: dict, counts: dict) -> dict:
    ids = [o["id"] for o in contest["options"]]
    if contest["method"] == "single-choice":
        w = 1
    elif "winners" in contest:
        w = contest["winners"]
    elif contest["method"] == "k-of-n":
        w = contest["selection_limit"]
    elif contest["method"] == "approval":
        w = 1  # QV-20 §5.3: single winner unless the manifest specifies otherwise.
    else:
        raise QVError("E_RULES", "number of winners undefined")
    ranked = sorted(ids, key=lambda o: -counts.get(o, 0))
    if w >= len(ids):
        return {"kind": "winners", "winners": ranked}
    cut = counts.get(ranked[w - 1], 0)
    above = [o for o in ranked if counts.get(o, 0) > cut]
    at_cut = sorted(o for o in ranked if counts.get(o, 0) == cut)
    seats = w - len(above)
    if len(at_cut) == seats:
        return {"kind": "winners", "winners": above + at_cut}
    tb = contest["tie_break"]
    if tb["type"] == "lexicographic":
        return {"kind": "winners", "winners": above + at_cut[:seats], "reason": "tie-break"}
    if tb["type"] == "declare-tie":
        return {"kind": "tie", "winners": above, "tied": at_cut}
    if tb["type"] == "status-quo" and tb.get("option") in at_cut and seats == 1:
        return {"kind": "winners", "winners": above + [tb["option"]], "reason": "tie-break"}
    raise QVError("E_RULES", f"tie_break {tb['type']!r} cannot resolve this tie")


def evaluate(quorum: dict | None, contest: dict, counts: dict, participation: int, roll_size: int) -> dict:
    met = quorum_met(quorum, participation, roll_size)
    if not met:
        outcome = {"kind": "no-quorum"}
    elif contest["method"] == "yes-no":
        outcome = _yes_no(contest, counts, participation, roll_size)
    else:
        outcome = _multi(contest, counts)
    return {"contest": contest["id"], "participation": participation, "quorum_met": met, "outcome": outcome}
