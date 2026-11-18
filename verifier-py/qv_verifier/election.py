"""Full-election verification (QV-16 Appendix C) over a QV-34 election bundle
``{"manifest_hash", "manifest": {"body", "sigs"}, "roll": [...], "log": [{"seq", "entry"}]}``.

Produces the QV-34 §9.1 named-check map plus counts, ctx prefix, recomputed results and the
list of findings (check id, error code, fatal?, detail).

Design decisions where the specs leave the behaviour open (each is listed in
docs/errata/spec-errata-log.md):
  * If the manifest does not hash to the out-of-band anchor or lacks its coordinator quorum,
    dependent checks are ``not_run`` (QV-ERR-PY-007; QV-ADR-027).
  * Failed tally decryption prevents rule evaluation. Failed rule verification emits no results
    (QV-ADR-027, approved DIFF-count-altered / DIFF-result-flipped decisions).
  * A tally aggregate that cannot be confirmed (ctx, counted root, aggregate mismatch) makes
    ``chk.tally.decrypt`` and ``chk.result.rules`` ``not_run``: decrypting or evaluating
    unconfirmed aggregates proves nothing (QV-ERR-PY-008).
  * Codes absent from QV-16 §5.20 but required by the vectors (E_MANIFEST_HASH,
    E_MANIFEST_SIG, E_AGG_MISMATCH) are emitted as the vectors name them (QV-ERR-PY-004).
  * Record signatures: DKG records and ``dkg-*`` markers use scope manifest_hash (QV-16
    §5.6.3 "pre-key scope"), every later record uses ctx; record_type is ``body.type``.
    The tally signature is a convenience signature and is reported only as a note.
  * Board consistency / witnesses / receipts are ``not_run`` when optional log
    evidence is absent, capping the default verdict at INCOMPLETE. The stable
    QV-18 path is composed only when supplied.
  * A stop makes only the checks that have not run yet ``not_run``; checks already completed
    (``chk.manifest.sig`` after App. C steps 2-4, ``chk.keys.trustees`` after steps 5-10) keep their
    result. ``chk.encoding.canonical`` is complete only once the voter envelopes were examined, so a
    stop before C4 leaves it ``not_run`` unless a record already failed it (QV-35-REQ-003).
  * A tally record rejected by QV-JSON, the closed schema or ``proto`` is not examined: aggregate,
    decrypt and rules are ``not_run`` (QV-16 §5.5 item 7, App. C step 1, §5.20 E_SCHEMA class R/L).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from . import ballot, dkg, ed25519, manifest as manifest_mod, merkle, qvjson, rules
from .edwards import L as ELL
from .errors import QVError, NotImplementedOp
from .framed_hash import H256
from .proofs import dec_check, pok_share_check
from .ristretto import G, R_IDENTITY, RPoint, decode_hex, scalar_decode_hex
from .recordfields import hex_field, integer, valid_body

CHECKS = [
    "chk.manifest.hash", "chk.manifest.sig", "chk.keys.trustees", "chk.board.append_only",
    "chk.board.witness", "chk.ballots.valid", "chk.ballots.latest", "chk.tally.aggregate",
    "chk.tally.decrypt", "chk.result.rules", "chk.benaloh.spoiled", "chk.receipts.sample",
    "chk.encoding.canonical", "chk.time.window",
]
PROTO = "qv1-r255-sha2"
ZERO32 = "00" * 32

_RECORD_KEYS = {
    "dkg-commit": ({"proto", "type", "i", "h"}, set()),
    "dkg-dealing": ({"proto", "type", "i", "enc", "coeffs"}, set()),
    "dkg-shares": ({"proto", "type", "i", "shares"}, set()),
    "dkg-complaint": ({"proto", "type", "accuser", "accused", "S", "c", "s"}, set()),
    "dkg-keyconf": ({"proto", "type", "j", "c", "s"}, set()),
    "marker": ({"proto", "type", "name"}, {"qmask", "K", "manifest_hash", "joint_key_seq", "roll_commit_seq"}),
    "roll-commit": ({"proto", "type", "root", "size"}, set()),
    "tally": ({"proto", "type", "ctx", "n_counted", "counted_root", "decrypters", "contests", "results"},
              {"spoiled"}),
}


@dataclass
class Finding:
    # None denotes a finding that does not change a named check, e.g. an
    # ignored bad-signature duplicate or a conflict between valid tally bodies.
    check: str | None
    code: str
    fatal: bool
    detail: str = ""


@dataclass
class State:
    findings: list[Finding] = field(default_factory=list)
    skipped: set[str] = field(default_factory=set)
    completed: set[str] = field(default_factory=set)
    notes: list[str] = field(default_factory=list)

    def add(self, check: str | None, code: str, fatal: bool, detail: str = "") -> None:
        self.findings.append(Finding(check, code, fatal, detail))

    def skip(self, *checks: str) -> None:
        self.skipped.update(checks)

    def complete(self, *checks: str) -> None:
        """Mark checks whose whole scope has been examined: a later stop leaves their status alone."""
        self.completed.update(checks)

    def failed(self, check: str) -> bool:
        return any(f.check == check for f in self.findings)


def _keys_ok(obj: Any, req: set[str], opt: set[str]) -> bool:
    return isinstance(obj, dict) and req <= set(obj) <= req | opt


def _record_schema_ok(entry: Any) -> bool:
    """Closed schema for a signed record entry (QV-16 §5.5 envelope + §5.7 / §5.19 bodies)."""
    if not isinstance(entry, dict) or not ("body" in entry and len(entry) == 2 and ("sig" in entry or "sigs" in entry)):
        return False
    body = entry["body"]
    if not isinstance(body, dict) or not isinstance(body.get('type'), str) or body.get("type") not in _RECORD_KEYS:
        return False
    req, opt = _RECORD_KEYS[body["type"]]
    if not _keys_ok(body, req, opt):
        return False
    if not valid_body(body):
        return False
    if body["type"] == "marker":
        # QV-ADR-015 / X-40: binding fields required on election-open, forbidden on every other marker.
        bind = {"manifest_hash", "joint_key_seq", "roll_commit_seq"}
        have = bind & set(body)
        if body.get("name") == "election-open":
            # Absence is NOT a schema error: the vectors (open-*-absent) expect E_MARKERS on
            # chk.time.window, raised by the binding check (see errata QV-ERR-PY-006).
            mhx = body.get("manifest_hash")
            if mhx is not None and not (isinstance(mhx, str) and len(mhx) == 64
                                        and all(c in "0123456789abcdef" for c in mhx)):
                return False
            if not all(type(body[k]) is int and body[k] >= 0 for k in ("joint_key_seq", "roll_commit_seq") if k in body):
                return False
        elif have:
            return False
    if body["type"] == "roll-commit":
        if not (isinstance(body["root"], str) and len(body["root"]) == 64
                and all(c in "0123456789abcdef" for c in body["root"])):
            return False
        if type(body["size"]) is not int or not 1 <= body["size"] <= 1 << 20:
            return False
    if body["type"] == "tally":
        for c in body["contests"]:
            if not _keys_ok(c, {"id", "options"}, set()):
                return False
            for o in c["options"]:
                if not _keys_ok(o, {"id", "A", "B", "shares", "T"}, set()):
                    return False
                if not all(_keys_ok(s, {"j", "M", "c", "s"}, set()) for s in o["shares"]):
                    return False
        for s in body.get("spoiled", []):
            if not _keys_ok(s, {"code", "mode"}, {"selections", "shares"}):
                return False
        for r in body["results"]:
            if not _keys_ok(r, {"contest", "participation", "quorum_met", "outcome"}, set()):
                return False
    sigs = entry["sigs"] if "sigs" in entry else [entry["sig"]]
    return isinstance(sigs, list) and all(_keys_ok(s, {"key", "sig"}, set()) and hex_field(s['key'], 32) and hex_field(s['sig'], 64) for s in sigs)


def record_msg(scope: bytes, body: dict) -> bytes:
    """QV-16 §5.4 sig-record digest: H256("sig-record"; scope_hash, record_type, JCS(body))."""
    return H256("sig-record", scope, body["type"], qvjson.jcs(body))


def _sig_valid(scope: bytes, body: dict, sig: dict, key_hex: str) -> bool:
    try:
        return sig.get("key") == key_hex and ed25519.verify(
            bytes.fromhex(key_hex), record_msg(scope, body), bytes.fromhex(sig["sig"])
        )
    except (ValueError, TypeError, KeyError, QVError):
        return False


def _coordinator_ok(scope: bytes, body: dict, sigs: Any, coord: dict) -> bool:
    if not isinstance(sigs, list):
        return False
    good = set()
    for s in sigs:
        if isinstance(s, dict) and s.get("key") in coord["keys"] and _sig_valid(scope, body, s, s["key"]):
            good.add(s["key"])
    return len(good) >= coord["m"]


def lagrange_at_zero(S: list[int], j: int) -> int:
    lam = 1
    for m in S:
        if m != j:
            lam = lam * m * pow((m - j) % ELL, -1, ELL) % ELL
    return lam


def bsgs(D: RPoint, bound: int) -> int | None:
    """QV-16 §5.18: smallest T in [0, bound] with [T]G == D, else None."""
    m = math.isqrt(bound) + 1  # >= ceil(sqrt(bound + 1))
    table = {}
    P = R_IDENTITY
    for i in range(m):
        table.setdefault(P.encode(), i)
        P = P + G
    giant = -G.mul(m)
    Q = D
    for k in range(m + 1):
        i = table.get(Q.encode())
        if i is not None:
            T = k * m + i
            return T if T <= bound and G.mul(T) == D else None
        Q = Q + giant
    return None


def verify_bundle(bundle: dict, *, log: dict | None = None, allow_no_log: bool = False) -> dict:
    """Verify an election, optionally with independent QV-18 evidence.

    ``log`` contains ``board`` and optional ``receipts``, ``observed``,
    ``witnesses`` and ``extraAuthorKeys``. Log evidence authenticates legacy
    control notices independently of the core's class-L unknown-record finding.
    ``allow_no_log`` is a trusted caller-only content-verification opt-out, never
    a bundle field. Supplied log failures still fail; unchecked supplied evidence
    never qualifies. A verified append-only log with an explicit zero-witness
    manifest policy may retain a prominently caveated content-only PASS.
    """
    if log is not None:
        from . import logcheck
    st = State()
    st.skip("chk.board.append_only", "chk.receipts.sample")
    out: dict[str, Any] = {"counts": {"cast": 0, "spoiled": 0, "counted": 0}}
    try:
        _verify(bundle, st, out)
    except _Stop:
        pass
    if log is not None and "chk.manifest.sig" in st.completed and not any(
            st.failed(c) for c in ("chk.manifest.hash", "chk.manifest.sig")):
        try:
            logcheck.verify_into(bundle, log, st)
        except NotImplementedOp:
            raise
        except QVError:
            st.add("chk.board.append_only", "E_LOG_FORMAT", True, "supplied log evidence rejected")
        except Exception:
            # Operational failure is not negative evidence about the election.
            # Existing fatal findings survive; no partial log pass survives.
            st.skip("chk.board.append_only", "chk.board.witness", "chk.receipts.sample")
            st.notes.append("Supplied log evidence could not be fully checked; verification is INCOMPLETE unless another check fails")
    checks = {}
    for c in CHECKS:
        if any(f.check == c for f in st.findings):
            checks[c] = "fail"
        elif c in st.skipped:
            checks[c] = "not_run"
        else:
            checks[c] = "pass"
    out["checks"] = checks
    # QV-ADR-027 / PY-02: an unfinished tally is neither a verified outcome nor
    # a fatal election failure. Fatal evidence always takes precedence.
    incomplete_log = any(checks[c] != "pass" for c in ("chk.board.append_only", "chk.board.witness"))
    zero_witness = (isinstance(bundle, dict) and isinstance(bundle.get("manifest"), dict) and
                    isinstance(bundle["manifest"].get("body"), dict) and
                    isinstance(bundle["manifest"]["body"].get("bb"), dict) and
                    bundle["manifest"]["body"]["bb"].get("witness_quorum") == 0)
    content_only = allow_no_log is True and (log is None or (
        checks["chk.board.append_only"] == "pass" and zero_witness))
    if content_only and incomplete_log:
        st.notes.append("CONTENT-ONLY verification explicitly requested by the caller; PASS does not establish witnessed log integrity")
    out["verdict"] = ("FAIL" if any(f.fatal for f in st.findings) else
                      "INCOMPLETE" if checks["chk.tally.decrypt"] == "not_run" or
                      (incomplete_log and not content_only) else "PASS")
    out["codes"] = sorted({f.code for f in st.findings})
    out["findings"] = [f.__dict__ for f in st.findings]
    out["notes"] = st.notes
    return out


class _Stop(Exception):
    pass


def _stop(st: State, *checks: str) -> None:
    """Abort the pipeline; the named checks that have not run yet become ``not_run``.

    A check that already ran to completion keeps its result (``pass``/``fail``): QV-35-REQ-005 and
    QV-ERR-PY-015 make only the *later* checks ``not_run``, and QV-34 §9.1 has no status for "ran, but
    is reported as not run".
    """
    st.skip(*(c for c in checks if c not in st.completed))
    raise _Stop


ALL_AFTER_MANIFEST = [c for c in CHECKS if c != "chk.manifest.hash"]


def _open_binding_error(
    open_seq: int, ob: dict, mh: bytes, mk: dict[str, int], by_seq: dict[int, dict],
    roll_root_hex: str | None, roll_size: int, coord: dict,
) -> str | None:
    """QV-ADR-015: election-open binds (manifest_hash, joint_key_seq, roll_commit_seq). Returns the reason it fails, or None.

    Mirrors packages/protocol/src/verify.ts. Every reference must name the right EARLIER record (fail closed).
    """
    if "manifest_hash" not in ob or "joint_key_seq" not in ob or "roll_commit_seq" not in ob:
        return "election-open lacks manifest_hash/joint_key_seq/roll_commit_seq"
    if ob["manifest_hash"] != mh.hex():
        return "election-open manifest_hash differs from the manifest hash"
    jk, rc = ob["joint_key_seq"], ob["roll_commit_seq"]
    if not isinstance(jk, int) or not isinstance(rc, int) or jk >= open_seq or rc >= open_seq:
        return "election-open references a record that is not earlier in the log"
    if jk != mk.get("dkg-final"):
        return "election-open joint_key_seq does not point at the dkg-final marker"
    en = by_seq.get(rc)
    if en is None or en["body"].get("type") != "roll-commit" or not _coordinator_ok(mh, en["body"], en.get("sigs"), coord):
        return "election-open roll_commit_seq does not point at a valid roll-commit record"
    if en["body"]["root"] != roll_root_hex or en["body"]["size"] != roll_size:
        return "the roll-commit bound by election-open does not match the supplied roll"
    return None


def _verify(bundle: dict, st: State, out: dict) -> None:
    # ------------------------------------------------ C1 manifest and parameters
    env = bundle.get("manifest")
    if (not _keys_ok(env, {"body", "sigs"}, set()) or not isinstance(env.get('sigs'), list)
            or not all(_keys_ok(s, {'key', 'sig'}, set()) and hex_field(s['key'], 32) and hex_field(s['sig'], 64) for s in env['sigs'])):
        st.add("chk.manifest.hash", "E_SCHEMA", True, "manifest envelope")
        st.add('chk.encoding.canonical', 'E_SCHEMA', True, 'manifest envelope')
        _stop(st, *[c for c in ALL_AFTER_MANIFEST if c != 'chk.encoding.canonical'])
    body = env["body"]
    try:
        j, mh = manifest_mod.manifest_hash(body)
    except QVError as e:
        st.add("chk.manifest.hash", e.code, True, e.detail)
        st.add("chk.encoding.canonical", e.code, True, "manifest")
        _stop(st, *[c for c in ALL_AFTER_MANIFEST if c != "chk.encoding.canonical"])
    if mh.hex() != bundle.get("manifest_hash"):
        st.add("chk.manifest.hash", "E_MANIFEST_HASH", True, "manifest does not hash to the anchor")
        _stop(st, *ALL_AFTER_MANIFEST)
    roll_hex = bundle.get("roll")
    if not isinstance(roll_hex, list):
        st.add("chk.manifest.sig", "E_ROLL", True, "roll missing")
        _stop(st, *ALL_AFTER_MANIFEST)
    try:
        manifest_mod.validate(body, len(roll_hex))
    except QVError as e:
        st.add("chk.manifest.sig", e.code, True, e.detail)
        if e.code in ("E_PARSE", "E_SCHEMA"):
            st.add("chk.encoding.canonical", e.code, True, "manifest")
        _stop(st, *[c for c in ALL_AFTER_MANIFEST if not st.failed(c)])
    m = body
    coord = m["coordinator"]
    if not _coordinator_ok(mh, m, env["sigs"], coord):
        st.add("chk.manifest.sig", "E_MANIFEST_SIG", True, "fewer than m valid coordinator signatures")
        _stop(st, *ALL_AFTER_MANIFEST)
    roll_root_hex: str | None = None
    try:
        if not all(hex_field(x, 32) for x in roll_hex):
            raise QVError('E_ROLL', 'roll keys must be lower-case fixed-width hex')
        roll_pks = [bytes.fromhex(x) for x in roll_hex]
        root, _ = merkle.roll_root(roll_pks)
        roll_root_hex = root.hex()
        if "root" in m["roll"] and root.hex() != m["roll"]["root"]:
            raise QVError("E_ROLL", "roll root differs from manifest")
    except (QVError, ValueError, TypeError) as e:
        st.add("chk.manifest.sig", getattr(e, "code", "E_ROLL"), True, str(e))
        roll_pks = []
    roll = set(roll_pks)
    roll_root_hex = locals().get("roll_root_hex")
    n_roll = m["roll"].get("size", len(roll_pks))
    st.complete("chk.manifest.sig")  # coordinator signatures, manifest fields and roll (App. C steps 2-4) are done

    # ------------------------------------------------ log structure
    log = bundle.get("log")
    if not isinstance(log, list):
        st.add("chk.encoding.canonical", "E_SCHEMA", True, "log missing")
        _stop(st, *[c for c in ALL_AFTER_MANIFEST if not st.failed(c)])
    seqs = [e.get("seq") for e in log if isinstance(e, dict)]
    if len(seqs) != len(log) or any(not integer(s) for s in seqs) or seqs != sorted(set(seqs)):
        st.add("chk.board.append_only", "E_LOG_ORDER", True, "sequence numbers not strictly increasing")
    envelopes, records = [], []
    rejected_tally = False  # a tally record that fails QV-JSON / closed schema / proto is rejected, never examined
    for e in log:
        en = e.get("entry") if isinstance(e, dict) else None
        if not isinstance(en, dict):
            st.add("chk.encoding.canonical", "E_SCHEMA", False, f"seq {e.get('seq') if isinstance(e, dict) else '?'}")
            continue
        if "intent" in en:
            envelopes.append((e["seq"], en))
            continue
        is_tally = isinstance(en.get("body"), dict) and en["body"].get("type") == "tally"
        try:
            qvjson.check_value(en)
        except QVError as ex:
            st.add("chk.encoding.canonical", ex.code, is_tally, f"seq {e['seq']}: {ex.detail}")
            rejected_tally |= is_tally
            continue
        body_type = en.get('body', {}).get('type') if isinstance(en.get('body'), dict) else None
        if isinstance(body_type, str) and en["body"].get("proto") != PROTO:
            # ADR-027 B1-02: unknown versions are rejected as log noise, including
            # a versioned tally which this verifier must not attempt to examine.
            st.add("chk.encoding.canonical", "E_VERSION", False, f"seq {e['seq']}: proto")
            rejected_tally |= is_tally
            continue
        if isinstance(body_type, str) and body_type not in _RECORD_KEYS:
            # ADR-027 / B1-02 option A: an unrecognised non-ballot record is
            # rejected from protocol computation as class L, not an election
            # veto. Legacy control authority is checked separately with log
            # evidence (N-12 / X31-X34); this branch grants it no authority.
            st.add('chk.encoding.canonical', 'E_VERSION', False, f"seq {e['seq']}: unknown record type {body_type}")
            continue
        if not _record_schema_ok(en):
            # QV-16 §5.5 item 7 (closed schemas, "eliminating malleability through junk fields"), App. C step 1
            # ("reject on E_PARSE/E_SCHEMA/E_VERSION") and §5.20 (E_SCHEMA is R/L: not counted): the record is
            # rejected. A rejected tally is not examined, so its aggregate/decrypt/rules checks are not_run.
            st.add("chk.encoding.canonical", "E_SCHEMA", is_tally, f"seq {e['seq']}: record schema")
            rejected_tally |= is_tally
            continue
        records.append((e["seq"], en))

    trustee_pk = {t["index"]: t["sign_pk"] for t in m["trustees"]}
    n, t = m["n"], m["t"]

    # ------------------------------------------------ C2 DKG
    markers: dict[str, tuple[int, dict]] = {}
    pre: dict[str, list] = {"commits": [], "dealings": [], "shares": [], "complaints": []}
    keyconfs: list[tuple[int, dict]] = []
    tally_recs: list[tuple[int, dict]] = []
    later_markers: list[tuple[int, dict]] = []
    roll_commits: list[tuple[int, dict]] = []
    kind = {"dkg-commit": ("commits", "i"), "dkg-dealing": ("dealings", "i"),
            "dkg-shares": ("shares", "i"), "dkg-complaint": ("complaints", "accuser")}
    for seq, en in records:
        b = en["body"]
        ty = b["type"]
        if ty == "marker":
            name = b.get("name")
            if isinstance(name, str) and name.startswith("dkg-"):
                if _coordinator_ok(mh, b, en.get("sigs"), coord):
                    if name in markers:
                        st.add(None, "E_MARKERS", False, f"seq {seq}: duplicate marker {name}")
                    else:
                        markers[name] = (seq, b)
                else:
                    st.add(None, "E_SIG", False, f"seq {seq}: marker {name} signature")
            else:
                later_markers.append((seq, en))
        elif ty in kind:
            lst, who = kind[ty]
            idx = b.get(who)
            if idx in trustee_pk and _sig_valid(mh, b, en.get("sig", {}), trustee_pk[idx]):
                pre[lst].append({"seq": seq, "body": b})
            else:
                st.add(None, "E_SIG", False, f"seq {seq}: {ty} not signed by trustee {idx}")
        elif ty == "roll-commit":
            if _coordinator_ok(mh, b, en.get("sigs"), coord):
                roll_commits.append((seq, b))
            else:
                st.add(None, "E_SIG", False, f"seq {seq}: roll-commit signature")
        elif ty == "dkg-keyconf":
            keyconfs.append((seq, en))
        elif ty == "tally":
            tally_recs.append((seq, en))
    need = ["dkg-open", "dkg-r1-open", "dkg-r1-close", "dkg-r2-close", "dkg-r3-close", "dkg-final"]
    if any(x not in markers for x in need) or any(markers[a][0] >= markers[b][0] for a, b in zip(need, need[1:]) if a in markers and b in markers):
        st.add("chk.keys.trustees", "E_DKG_MARKERS", True, "DKG phase markers missing or misordered")
        _stop(st, *[c for c in ALL_AFTER_MANIFEST if not st.failed(c)])
    mk = {k: v[0] for k, v in markers.items()}
    try:
        res = dkg.adjudicate(mh, n, t, mk, pre)
    except QVError as e:
        st.add("chk.keys.trustees", e.code, True, e.detail)
        _stop(st, *[c for c in ALL_AFTER_MANIFEST if not st.failed(c)])
    K, Y, ctx, Q = res["K"], res["Y"], res["ctx"], res["Q"]
    out["ctx_prefix"] = ctx.hex()[:16]
    fin = markers["dkg-final"][1]
    if fin.get("qmask") != res["qmask"] or fin.get("K") != K.hex():
        st.add("chk.keys.trustees", "E_DKG_FINAL", False, "dkg-final marker differs from recomputation")
    T_set = set()
    for seq, en in keyconfs:
        b = en["body"]
        jj = b.get("j")
        if jj not in Q or jj in T_set or not (mk["dkg-r3-close"] < seq < mk["dkg-final"]):
            continue
        if not _sig_valid(mh, b, en.get("sig", {}), trustee_pk[jj]):
            continue
        try:
            if pok_share_check(ctx, jj, Y[jj], scalar_decode_hex(b["c"]), scalar_decode_hex(b["s"])):
                T_set.add(jj)
        except QVError:
            continue
    if len(T_set) < t:
        st.add("chk.keys.trustees", "E_DKG_KEYCONF", True, f"|T| = {len(T_set)} < t")
        _stop(st, *[c for c in ALL_AFTER_MANIFEST if not st.failed(c)])
    st.complete("chk.keys.trustees")  # App. C steps 5-10 are done

    # ------------------------------------------------ C3 window markers
    # Only authenticated markers can occupy a phase. Earlier junk and later
    # duplicates remain visible without replacing the first valid signature set.
    window_markers: dict[str, tuple[int, dict]] = {}
    for seq, en in later_markers:
        name = en["body"].get("name")
        if name not in ("election-open", "election-close"):
            continue
        if not _coordinator_ok(ctx, en["body"], en.get("sigs"), coord):
            st.add(None, "E_SIG", False, f"seq {seq}: window marker signature")
        elif name in window_markers:
            st.add(None, "E_MARKERS", False, f"seq {seq}: duplicate marker {name}")
        else:
            window_markers[name] = (seq, en)
    opens = [window_markers["election-open"]] if "election-open" in window_markers else []
    closes = [window_markers["election-close"]] if "election-close" in window_markers else []
    if opens:
        bind_err = _open_binding_error(opens[0][0], opens[0][1]["body"], mh, mk, dict(records), roll_root_hex, len(roll_hex), coord)
        if bind_err is not None:
            st.add("chk.time.window", "E_MARKERS", True, bind_err)
    if not opens or not closes:
        st.add(None, "E_MARKERS", False, "authenticated open/close markers missing")
        _stop(st, *[c for c in ALL_AFTER_MANIFEST if not st.failed(c)])
    if not opens[0][0] < closes[0][0]:
        st.add(None, "E_MARKERS", True, "open/close markers misordered")
        _stop(st, *[c for c in ALL_AFTER_MANIFEST if not st.failed(c)])
    else:
        open_seq, close_seq = opens[0][0], closes[0][0]
        # QV-ADR-015 / X-40: election-open binds (manifest_hash, joint_key_seq, roll_commit_seq); fail closed.
        ob = opens[0][1]["body"]
        rc = {s_: b_ for s_, b_ in roll_commits}.get(ob.get("roll_commit_seq"))
        bind_err = None
        if any(k not in ob for k in ("manifest_hash", "joint_key_seq", "roll_commit_seq")):
            bind_err = "election-open lacks manifest_hash/joint_key_seq/roll_commit_seq"
        elif ob["manifest_hash"] != mh.hex():
            bind_err = "election-open manifest_hash differs from the manifest hash"
        elif ob["joint_key_seq"] >= open_seq or ob["roll_commit_seq"] >= open_seq:
            bind_err = "election-open references a record that is not earlier in the log"
        elif ob["joint_key_seq"] != mk["dkg-final"]:
            bind_err = "election-open joint_key_seq does not point at the dkg-final marker"
        elif rc is None:
            bind_err = "election-open roll_commit_seq does not point at a valid roll-commit record"
        elif rc["root"] != roll_root_hex or rc["size"] != len(roll_hex):
            bind_err = "the roll-commit bound by election-open does not match the supplied roll"
        if bind_err:
            st.add("chk.time.window", "E_MARKERS", True, f"seq {open_seq}: {bind_err}")
            _stop(st, *[c for c in ALL_AFTER_MANIFEST if not st.failed(c)])
    if m["bb"]["witness_quorum"] == 0:
        st.skip("chk.board.witness")
        st.notes.append("times unwitnessed (witness_quorum = 0)")
    else:
        st.skip("chk.board.witness")
        st.notes.append("witness cosignatures required but not supported by this skeleton")

    # ------------------------------------------------ C4/C5 ballots and spoils
    casts, spoils = [], []
    signed_spoils = []
    spoiled_codes: set[bytes] = set()
    spoils_per_voter: dict[str, int] = {}
    for seq, en in envelopes:
        intent = en.get("intent")
        if intent == "cast":
            out["counts"]["cast"] += 1
        elif intent == "spoil":
            out["counts"]["spoiled"] += 1
        try:
            code = ballot.verify_envelope(m, K, ctx, roll, en)
        except QVError as e:
            st.add("chk.ballots.valid", e.code, False, f"seq {seq}: {e.detail}")
            if e.code in ("E_PARSE", "E_SCHEMA"):
                st.add("chk.encoding.canonical", e.code, False, f"seq {seq}")
            continue
        if en["intent"] == "spoil":
            spoiled_codes.add(code)
            signed_spoils.append((seq, en, code))
        if not open_seq < seq < close_seq:
            st.add("chk.time.window", "E_TIME_WINDOW", False, f"seq {seq} outside window")
            continue
        if en["intent"] == "spoil":
            voter = en["body"]["voter"]
            spoils_per_voter[voter] = spoils_per_voter.get(voter, 0) + 1
            if spoils_per_voter[voter] > m["ballots"]["max_spoils_per_voter"]:
                st.add("chk.ballots.latest", "E_REVOTE_LIMIT", False, f"seq {seq}: max_spoils_per_voter exceeded")
                continue
        (casts if en["intent"] == "cast" else spoils).append((seq, en, code))

    # Only envelope-valid casts can establish a ciphertext clash: junk signatures cannot plant an alpha.
    cast_codes = {code for _, _, code in casts}
    cast_alphas = {s["a"] for _, en, _ in casts for c in en["body"]["contests"] for s in c["sel"]}
    audit_codes = {code for _, _, code in spoils}
    reproduced: dict[str, dict] = {}
    for seq, en, code in signed_spoils:
        if code not in cast_codes and any(s["a"] in cast_alphas for c in en["body"]["contests"] for s in c["sel"]):
            st.add("chk.benaloh.spoiled", "E_SPOILED_CODE_CAST", False, f"seq {seq}: re-wrapped spoil shares ciphertexts with a cast")
            continue
        if code not in audit_codes:
            continue
        if "reveal" in en:
            try:
                rd = H256("reveal", ctx, qvjson.jcs(en["reveal"]))
                if rd.hex() != en["reveal_digest"]:
                    raise QVError("E_SPOIL_MISMATCH", "reveal_digest does not match reveal")
                ballot.verify_spoil_reveal(m, K, ctx, en["body"], en["reveal"])
                reproduced[code.hex()] = en["reveal"]["selections"]
            except QVError as e:
                st.add("chk.benaloh.spoiled", e.code, False, f"seq {seq}: {e.detail}")
        elif en["reveal_digest"] == ZERO32:
            st.notes.append(f"seq {seq}: trustee-decryption spoil mode not supported by this skeleton")

    # ADR-027 / QV-ERR-PY-010: only accepted, non-spoiled casts advance
    # supersedes, the per-voter limit and the counted ballot. An excluded later
    # cast cannot erase an earlier accepted vote or occupy another voter's code.
    prev: dict[str, str] = {}
    nadm: dict[str, int] = {}
    code_owner: dict[bytes, str] = {}
    counted: dict[str, tuple[dict, bytes]] = {}
    maxpv = m["ballots"]["max_per_voter"]
    for seq, en, code in casts:
        v = en["body"]["voter"]
        if en["body"]["supersedes"] != prev.get(v, ZERO32):
            st.add("chk.ballots.latest", "E_SUPERSEDES", False, f"seq {seq}")
            continue
        if nadm.get(v, 0) + 1 > maxpv:
            st.add("chk.ballots.latest", "E_REVOTE_LIMIT", False, f"seq {seq}")
            continue
        if code in code_owner and code_owner[code] != v:
            st.add(None, "E_DUP_CODE", False, f"seq {seq}")
            continue
        if code in spoiled_codes:
            st.add("chk.benaloh.spoiled", "E_SPOILED_CODE_CAST", False, f"seq {seq}")
            continue
        code_owner[code] = v
        prev[v] = code.hex()
        nadm[v] = nadm.get(v, 0) + 1
        counted[v] = (en["body"], code)
    V = len(counted)
    out["counts"]["counted"] = V

    # ------------------------------------------------ C6 tally
    if not tally_recs and rejected_tally:
        # No admissible current-suite tally survived parsing: malformed tally
        # schema is fatal; unknown protocol versions are class L. Neither is
        # examined for aggregation, decryption or outcome computation.
        _stop(st, "chk.tally.aggregate", "chk.tally.decrypt", "chk.result.rules")
    if not tally_recs:
        # No candidate tally was supplied. Retain the completed evidence, but
        # do not fabricate an aggregate error or report a result (PY-02).
        _stop(st, "chk.tally.aggregate", "chk.tally.decrypt", "chk.result.rules")
    tseq, ten = tally_recs[0]
    tb = ten["body"]
    first_body = qvjson.jcs(tb)
    for seq, other in tally_recs[1:]:
        if qvjson.jcs(other["body"]) == first_body:
            st.add(None, "E_SCHEMA", False, f"seq {seq}: duplicate tally; only the first is examined")
        else:
            st.add(None, "E_RESULT", True, f"seq {seq}: conflicting tally body")
    if not _coordinator_ok(ctx, tb, [ten["sig"]] if "sig" in ten else ten.get("sigs"), {**coord, "m": 1}):
        st.notes.append("tally convenience signature does not verify (record is verified, not trusted)")
    try:
        if tb.get("ctx") != ctx.hex():
            st.add("chk.tally.aggregate", "E_CTX", True, "tally ctx differs from election ctx")
        leaves = sorted(
            ((bytes.fromhex(v), code) for v, (_, code) in counted.items()), key=lambda x: x[0]
        )
        croot = merkle.mth([code + pk for pk, code in leaves])
        if tb.get("counted_root") != croot.hex() or tb.get("n_counted") != V:
            st.add("chk.tally.aggregate", "E_COUNTED_ROOT", True, "counted set differs from log")
        mcont = m["contests"]
        tcont = tb["contests"]
        if [c["id"] for c in tcont] != [c["id"] for c in mcont] or any(
            [o["id"] for o in tc["options"]] != [o["id"] for o in mc["options"]]
            for tc, mc in zip(tcont, mcont)
        ):
            st.add("chk.tally.aggregate", "E_STRUCTURE", True, "tally contests/options differ from manifest")
            _stop(st, "chk.tally.decrypt", "chk.result.rules")
        agg: dict[tuple[str, str], tuple[RPoint, RPoint]] = {}
        for mc in mcont:
            for o in mc["options"]:
                A, B = R_IDENTITY, R_IDENTITY
                for body_, _ in counted.values():
                    bc = next(c for c in body_["contests"] if c["id"] == mc["id"])
                    e = next(x for x in bc["sel"] if x["opt"] == o["id"])
                    A, B = A + decode_hex(e["a"]), B + decode_hex(e["b"])
                agg[(mc["id"], o["id"])] = (A, B)
        for tc in tcont:
            for to in tc["options"]:
                A, B = agg[(tc["id"], to["id"])]
                if to["A"] != A.hex() or to["B"] != B.hex():
                    st.add("chk.tally.aggregate", "E_AGG_MISMATCH", True, f"{tc['id']}/{to['id']}")
                elif V > 0 and A.is_identity():
                    st.add("chk.tally.aggregate", "E_AGG_IDENTITY", True, f"{tc['id']}/{to['id']}")
    except (KeyError, TypeError, ValueError, StopIteration, QVError) as ex:
        st.add("chk.tally.aggregate", "E_SCHEMA", True, f"tally unusable: {ex}")
    if st.failed("chk.tally.aggregate"):
        _stop(st, "chk.tally.decrypt", "chk.result.rules")

    # decryption
    floor = m.get("min_counted_ballots", 3 if n_roll < 8 else 5)
    counts: dict[str, dict[str, int]] = {}
    try:
        if V < floor:
            st.add("chk.tally.decrypt", "E_BELOW_FLOOR", True, f"V = {V} < {floor}")
            _stop(st, "chk.result.rules")
        shares: dict[tuple[str, str], dict[int, dict]] = {}
        for tc in tcont:
            for to in tc["options"]:
                d = {}
                for s in to["shares"]:
                    d.setdefault(s["j"], s)
                shares[(tc["id"], to["id"])] = d
        T_valid = []
        for jj in sorted(T_set):
            okj = True
            for (cid, oid), d in shares.items():
                s = d.get(jj)
                if s is None:
                    okj = False
                    break
                A, B = agg[(cid, oid)]
                try:
                    M = decode_hex(s["M"])
                    c_, s_ = scalar_decode_hex(s["c"]), scalar_decode_hex(s["s"])
                    good = dec_check(ctx, cid, oid, jj, Y[jj], A, B, M, c_, s_)
                except QVError:
                    good = False
                if not good:
                    st.notes.append(f"E_DEC_PROOF: trustee {jj} share for {cid}/{oid} invalid (ignored)")
                    okj = False
                    break
            if okj:
                T_valid.append(jj)
        if len(T_valid) < t:
            st.add("chk.tally.decrypt", "E_TALLY_INSUFFICIENT", True, f"|T_valid| = {len(T_valid)} < t = {t}")
            _stop(st, "chk.result.rules")
        if tb.get("decrypters") != T_valid:
            st.add("chk.tally.decrypt", "E_DEC_PROOF", True,
                   f"tally.decrypters {tb.get('decrypters')} != T_valid {T_valid}")
        S = T_valid[:t]
        lam = {jj: lagrange_at_zero(S, jj) for jj in S}
        for tc, mc in zip(tcont, mcont):
            counts[tc["id"]] = {}
            for to in tc["options"]:
                A, B = agg[(tc["id"], to["id"])]
                Mo = R_IDENTITY
                for jj in S:
                    Mo = Mo + decode_hex(shares[(tc["id"], to["id"])][jj]["M"]).mul(lam[jj])
                To = bsgs(B - Mo, V)
                if To is None:
                    st.add("chk.tally.decrypt", "E_DLOG_RANGE", True, f"{tc['id']}/{to['id']}: no count <= V")
                    _stop(st, "chk.result.rules")
                if to["T"] != To:
                    st.add("chk.tally.decrypt", "E_DLOG_RANGE", True,
                           f"{tc['id']}/{to['id']}: published T {to['T']} != recovered {To}")
                counts[tc["id"]][to["id"]] = To
            lim = ballot.contest_limit(mc)
            if lim is not None and sum(counts[tc["id"]].values()) > lim * V:
                st.add("chk.tally.decrypt", "E_DLOG_RANGE", True, f"{tc['id']}: sum of counts > L*V")
    except (KeyError, TypeError, ValueError) as ex:
        st.add("chk.tally.decrypt", "E_SCHEMA", True, f"tally unusable: {ex}")
        _stop(st, "chk.result.rules")

    # published spoiled list (reveal mode) vs reproduced reveals
    pub = {s["code"]: s.get("selections") for s in tb.get("spoiled", []) if s.get("mode") == "reveal"}
    if pub != reproduced:
        st.add("chk.benaloh.spoiled", "E_SPOIL_MISMATCH", False, "tally.spoiled differs from reproduced reveals")

    # ------------------------------------------------ C7 results
    if st.failed("chk.tally.decrypt"):
        _stop(st, "chk.result.rules")
    try:
        results = [rules.evaluate(m.get("quorum"), mc, counts[mc["id"]], V, n_roll) for mc in m["contests"]]
    except (QVError, KeyError, TypeError, ValueError) as e:
        st.add("chk.result.rules", "E_RESULT", True, f"rule evaluation failed: {e}")
        return
    if tb.get("results") != results:
        st.add("chk.result.rules", "E_RESULT", True, "published results differ from evaluation")
    else:
        out["results"] = results
