# FAQ

> **Draft – unaudited software, not for real elections yet.**

**Is QuietVote ready to use?**
No. It is a plan and an early build. See [[Roadmap and Status]].

**Can I use it for a government or legally binding vote?**
No. It is for internal votes in voluntary groups. It does not meet any official e-voting standard (spec 00, non-claim N-9).

**Can the server operator see how I voted?**
The design says no. The operator never holds the key that opens ballots. It is trusted only to stay online.

**Can someone see that I voted?**
In version 1, yes. Who voted is public. How they voted is secret. See [[Privacy and Guarantees]].

**Can I prove to someone how I voted?**
The design does not prevent this. QuietVote does not protect you from being watched or forced to vote a certain way.

**What if I vote twice?**
Voting again is allowed. The latest valid ballot from your key counts.

**What if I lose my key?**
Recovery options are in spec [04](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md) section 6. Check the rules for your group.

**Do I need an account or my real name?**
Not by default. The group picks the identity mode. See spec 04 section 3.

**Does QuietVote use a blockchain or a token?**
No. There is no token, and it does not need a chain. Linking the log to a public timestamp service is optional (QV-ADR-012).

**Is the code open source?**
The proposed licence is AGPL-3.0-or-later, but no LICENSE file has been added yet (QV-ADR-011). Until one is added, no reuse permission is granted.

**How do I report a security problem?**
Follow [SECURITY.md](https://github.com/djshellshoxxx/quietvote/blob/main/SECURITY.md) and spec 33. Do not open a public issue.
