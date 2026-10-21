# FAQ

> **Draft – unaudited software.** Not for real elections.

**Is QuietVote ready to use?**
No. It is a specification and early build. See [[Roadmap and Status]].

**Can I use it for a government or legally binding election?**
No. It targets internal decisions in voluntary groups. It does not meet any e-voting certification standard (spec 00, non-claim N-9).

**Can the server operator see how I voted?**
The design says no. The operator never holds the decryption key. It is trusted only for availability.

**Can someone see that I voted?**
In the first phase, yes. Participation is public; choices are secret. See [[Privacy and Guarantees]].

**Can I prove how I voted to someone else?**
The design does not prevent this. Coercion resistance is an explicit non-claim.

**What if I vote twice?**
Revoting is allowed. The latest valid ballot from your key counts.

**What if I lose my key?**
Recovery options are described in [spec 04](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md) section 6. Check the rules for your group.

**Do I need an account or to give my real name?**
Not by default. The group chooses the identity mode. See [spec 04](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md) section 3.

**Does QuietVote use a blockchain or token?**
No. There is no token and no chain dependency. Anchoring to a public timestamp service is optional (QV-ADR-012).

**Is the code open source?**
The licence is proposed as AGPL-3.0-or-later, but no LICENSE file has been added yet (QV-ADR-011). Until it is, reuse is not granted.

**How do I report a security issue?**
Follow [SECURITY.md](https://github.com/djshellshoxxx/quietvote/blob/main/SECURITY.md) and spec 33. Do not open a public issue.
