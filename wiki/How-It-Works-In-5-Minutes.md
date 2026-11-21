# How It Works in 5 Minutes

> **Draft – unaudited software, not for real elections yet.** This is a plan and an early build. Do not use it for a real vote.

This page explains the idea in simple steps. It takes about 5 minutes to read.

## The big idea: sealed envelopes in a glass box

Picture a **glass box** with a slot on top.

- Each member puts a **sealed envelope** into the box. The envelope holds their choice.
- Anyone can see the box. They can see who put an envelope in. They cannot see inside.
- The box has a **lock** with several keys. Each key is held by a different **trustee**.
- When voting ends, enough trustees come together to open the box. They open only the **total**. They never open one envelope alone.
- Anyone can count the total again and check that it is right.

Real QuietVote uses math instead of glass and paper. The idea is the same.

**Caution:** if enough trustees agree, they could open single envelopes. So pick trustees you trust, and keep them independent of each other.

## Who does what

- **Members** vote.
- **Stewards** set the rules and the list of who can vote (the **roll**).
- **Trustees** each hold one piece of the lock.
- **The server** keeps the public **log**, which is the list of sealed ballots. It should not be able to read votes.
- **Checkers** (anyone) check that the rules, the roll and the count are right.

## The steps

1. **Rules first.** Stewards publish the rules and the roll before voting opens.
2. **Join.** Each member gets a voter key on their device. The key is linked to their name on the roll.
3. **Trustees make the lock.** The trustees make a shared key together. No single person ever holds the whole key.
4. **Vote.** Your device seals your choice into an encrypted **ballot**. It adds a math proof that the ballot is filled in correctly. It signs the ballot with your key.
5. **Post.** The sealed ballot goes into the public log. The log only grows. Nobody can quietly delete a line.
6. **Get a receipt.** Check that your ballot is in the log. This is optional but recommended.
7. **Change your mind?** You can vote again. The latest valid ballot counts. The log still shows that your key voted more than once.
8. **Close.** When voting ends, the trustees open only the total.
9. **Check.** Anyone can count again from public data, using an independent checker.

## What QuietVote tries to protect

- Your choice stays secret from other members, stewards and the server.
- Anyone can check the count.
- If the server drops or changes entries, people can spot it.
- Each voter key counts once. The latest valid ballot counts.

## What QuietVote does NOT protect

- **Someone watching you vote**, or **forcing you** to vote a certain way.
- **A hacked phone, computer or browser.** It can change or reveal your choice, and QuietVote cannot tell.
- **Who voted, in version 1.** Others can see that you voted. They cannot see how.
- **Trustees who work together.** If enough of them agree, they could open single ballots.
- **A server that goes down.** It can delay or block a vote.
- **Fake names.** The system checks a key, not a person. Stewards must keep the roll correct.

Read the full list in [[Privacy and Guarantees]].

## Next steps

- Voters: [[Voter Guide]]
- Stewards: [[Organizer Guide]]
- Trustees: [[Trustee Guide]]
- Checkers: [[Auditor and Verifier Guide]]
- Quick answers: [[FAQ]] · Hard words: [[Glossary]]
