"""Strict wire-field validation for QV-16 signed records before arithmetic or signature use.

Does not decide timeliness, duplicate handling or finding classes.
"""
import re

_HEX = re.compile(r'[0-9a-f]*')

def hex_field(value, size):
    return isinstance(value, str) and len(value) == size * 2 and _HEX.fullmatch(value) is not None

def integer(value, minimum=0, maximum=2**53 - 1):
    return type(value) is int and minimum <= value <= maximum

def _object(value, fields, optional=()):
    return isinstance(value, dict) and set(fields) <= set(value) <= set(fields) | set(optional)

def _proof(value, point):
    return _object(value, (point, 'c', 's')) and all(hex_field(value[k], 32) for k in (point, 'c', 's'))

def valid_body(body):
    """Validate the record-specific byte widths and exact JSON types. Never coerces inputs."""
    try:
        return _valid_body(body)
    except (KeyError, TypeError, ValueError):
        return False

def _valid_body(b):
    if not isinstance(b, dict) or not isinstance(b.get('proto'), str):
        return False
    ty = b.get('type')
    if ty == 'dkg-commit':
        return _object(b, ('proto', 'type', 'i', 'h')) and integer(b['i'], 1, 32) and hex_field(b['h'], 32)
    if ty == 'dkg-dealing':
        return (_object(b, ('proto', 'type', 'i', 'enc', 'coeffs')) and integer(b['i'], 1, 32)
                and _proof(b['enc'], 'E') and isinstance(b['coeffs'], list)
                and 1 <= len(b['coeffs']) <= 32 and all(_proof(c, 'A') for c in b['coeffs']))
    if ty == 'dkg-shares':
        return (_object(b, ('proto', 'type', 'i', 'shares')) and integer(b['i'], 1, 32)
                and isinstance(b['shares'], list) and len(b['shares']) <= 31
                and all(_object(s, ('j', 'R', 'ct', 'tag')) and integer(s['j'], 1, 32)
                        and hex_field(s['R'], 32) and hex_field(s['ct'], 32) and hex_field(s['tag'], 16)
                        for s in b['shares']))
    if ty == 'dkg-complaint':
        return (_object(b, ('proto', 'type', 'accuser', 'accused', 'S', 'c', 's'))
                and all(integer(b[k], 1, 32) for k in ('accuser', 'accused'))
                and all(hex_field(b[k], 32) for k in ('S', 'c', 's')))
    if ty == 'dkg-keyconf':
        return (_object(b, ('proto', 'type', 'j', 'c', 's')) and integer(b['j'], 1, 32)
                and hex_field(b['c'], 32) and hex_field(b['s'], 32))
    if ty == 'marker':
        return (isinstance(b.get('name'), str)
                and ('qmask' not in b or integer(b['qmask'], 1, 0xffffffff))
                and all(hex_field(b[k], 32) for k in ('K', 'manifest_hash') if k in b)
                and all(integer(b[k], 0, 0xffffffff) for k in ('joint_key_seq', 'roll_commit_seq') if k in b))
    if ty == 'roll-commit':
        return hex_field(b.get('root'), 32) and integer(b.get('size'), 1, 2**20)
    if ty != 'tally':
        return False
    if not (hex_field(b.get('ctx'), 32) and hex_field(b.get('counted_root'), 32)
            and integer(b.get('n_counted'), 0, 2**20) and isinstance(b.get('decrypters'), list)
            and all(integer(j, 1, 32) for j in b['decrypters'])
            and isinstance(b.get('contests'), list) and isinstance(b.get('results'), list)
            and isinstance(b.get('spoiled', []), list)):
        return False
    for c in b['contests']:
        if not (_object(c, ('id', 'options')) and isinstance(c['id'], str) and isinstance(c['options'], list)):
            return False
        for o in c['options']:
            if not (_object(o, ('id', 'A', 'B', 'shares', 'T')) and isinstance(o['id'], str)
                    and hex_field(o['A'], 32) and hex_field(o['B'], 32) and integer(o['T'], 0, 2**20)
                    and isinstance(o['shares'], list)):
                return False
            for s in o['shares']:
                if not (_object(s, ('j', 'M', 'c', 's')) and integer(s['j'], 1, 32)
                        and all(hex_field(s[k], 32) for k in ('M', 'c', 's'))):
                    return False
    for s in b.get('spoiled', []):
        if not (_object(s, ('code', 'mode'), ('selections', 'shares')) and hex_field(s['code'], 32)
                and s['mode'] in ('reveal', 'trustees')):
            return False
        if 'selections' in s and not _selections(s['selections']):
            return False
        if 'shares' in s:
            if not isinstance(s['shares'], list):
                return False
            for sp in s['shares']:
                if not (_object(sp, ('contest', 'opt', 'j', 'M', 'c', 's'))
                        and isinstance(sp['contest'], str) and isinstance(sp['opt'], str)
                        and integer(sp['j'], 1, 32) and all(hex_field(sp[k], 32) for k in ('M', 'c', 's'))):
                    return False
    for r in b['results']:
        if not (_object(r, ('contest', 'participation', 'quorum_met', 'outcome'))
                and isinstance(r['contest'], str) and integer(r['participation'], 0, 2**20)
                and type(r['quorum_met']) is bool and _object(r['outcome'], ('kind',), ('winners', 'tied', 'reason'))):
            return False
        out = r['outcome']
        if out['kind'] not in ('passed', 'rejected', 'no-quorum', 'tie', 'winners'):
            return False
        if 'reason' in out and not isinstance(out['reason'], str):
            return False
        if any(not isinstance(out[k], list) or not all(isinstance(x, str) for x in out[k]) for k in ('winners', 'tied') if k in out):
            return False
    return True

def _selections(value):
    return isinstance(value, dict) and all(isinstance(k, str) and isinstance(v, list) and all(isinstance(x, str) for x in v) for k, v in value.items())
