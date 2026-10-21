# Security Model and Threats

> **Draft – unaudited software.** Threat analysis is a draft. No independent security audit has been done.

Authoritative source: spec [07 Threat model](https://github.com/djshellshoxxx/quietvote/blob/main/docs/07-threat-model-security.md).

## Trust base

| Role | Trusted for |
|---|---|
| Trustees (threshold *t* of *n*) | Ballot secrecy, when fewer than *t* collude |
| Nobody | Integrity: anyone can verify |
| Server / operator | Availability only |
| Stewards | Roll correctness |
| Voter device and browser | Honest operation for that voter's own ballot |

Source: [decision log](https://github.com/djshellshoxxx/quietvote/blob/main/docs/decision-log.md) QV-ADR-001 and QV-ADR-008.

## Adversaries (summary)

The model covers operators, colluding or compelled trustees and stewards, members, coercers and vote buyers, network observers, compromised voter devices and malicious client builds served by the operator. Full profiles are in spec 07 section 5.

## Main properties and risks

- The model lists security properties (P1 to P15), STRIDE analysis per component and attack trees (spec 07 sections 6 to 8).
- Residual risks are in section 10.
- The security-claims register (section 12) ties each claim to evidence.
- Release-blocking gates are in section 13.

## Key residual risks

- Malicious or compromised client code, mitigated only partly (reproducible builds, integrity checks, optional CLI voting). See [spec 19](https://github.com/djshellshoxxx/quietvote/blob/main/docs/19-client-supply-chain.md).
- Coercion and vote buying. Not addressed beyond revoting.
- Trustee collusion or compulsion.
- Denial of service and availability failures.
- Undiscovered bugs.

## Non-claims

The binding list (N-1 to N-14) is summarized in [[Privacy and Guarantees]].

## Reporting a vulnerability

Follow [SECURITY.md](https://github.com/djshellshoxxx/quietvote/blob/main/SECURITY.md) and spec [33](https://github.com/djshellshoxxx/quietvote/blob/main/docs/33-vulnerability-disclosure.md). Do not file public issues for security problems.
