# QuietVote web copy

Generated from `src/i18n/en.ts` by `test/copy.test.ts` (run `UPDATE_COPY=1 npm test -w @quietvote/web` to refresh). Edit the catalog, not this file.

Voter-facing rules: sentences of at most 20 words and none of: ciphertext, ciphertexts, nonce, benaloh, dkg, cryptographic, cryptography, homomorphic, zero-knowledge, argon2, argon2id, elgamal, ristretto, merkle, ed25519, hash, kdf, aead, sth, checkpoint, spoil, spoiled, randomness, entropy, payload, api. Marked **[normative]** strings are guarantee copy from QV-10 section 7 and shown under "More details".

## Shell and navigation

- `qv.shell.skip`: Skip to main content
- `qv.shell.nav`: Main
- `qv.shell.language`: Language
- `qv.shell.privacyLink`: Privacy and limits
- `qv.shell.helpLink`: Help and accessibility
- `qv.shell.electionId`: Election ID
- `qv.shell.copy`: Copy
- `qv.shell.copied`: Copied.
- `qv.shell.copyFailed`: Could not copy. Select the text and copy it yourself.
- `qv.shell.footer.build`: Client {version}, build {build}
- `qv.shell.footer.verifyPage`: Verify this page
- `qv.shell.footer.source`: Source code (AGPL)
- `qv.shell.loading`: Loading…
- `qv.shell.loadingSlow`: Still working… this can take a minute on slow connections
- `qv.shell.noscript`: Casting needs JavaScript so your ballot can be locked on your device. You can also vote with the command-line tool or ask someone to prepare a ballot file for you.
- `qv.shell.stepOf`: Step {current} of {total}
- `qv.shell.back`: Back
- `qv.shell.continue`: Continue
- `qv.shell.done`: Done
- `qv.shell.title`: {step} — {election} — QuietVote
- `qv.shell.titleNoElection`: {step} — QuietVote
- `qv.shell.notFoundTitle`: 404
- `qv.shell.errorTitle`: Error
- `qv.shell.electionTitle`: Election
- `qv.shell.adminTitle`: Admin
- `qv.shell.unsupportedBrowser`: This browser can’t vote here. Use a newer browser or the command-line voter.

## Banners and status

- `qv.banner.experimental`: Experimental software. It has not been independently audited. Do not use it for votes that matter.
- `qv.banner.demo`: DEMO — not for real votes

## Home and "How this works"

- `qv.how.title`: How this works
- `qv.how.s1`: You vote in private.
- `qv.how.s2`: Your vote is locked, so nobody can read it.
- `qv.how.s3`: Everyone can check that the count is right.

## Home

- `qv.home.title`: Private votes that anyone can check
- `qv.home.intro`: Vote in secret with your group. Everyone can check that the count is right.
- `qv.home.haveLink`: Have an invitation link? Open it in this browser.
- `qv.home.openId`: Open an election by its address
- `qv.home.openIdHint`: Paste the link your organizer sent you.
- `qv.home.open`: Open election
- `qv.home.badLink`: That is not an election address on this server.

## Election page (step 1)

- `qv.election.opens`: Opens {when}
- `qv.election.closes`: Closes {when}
- `qv.election.deadline`: {electionTime} ({offset}, {zone})
- `qv.election.deadlineViewer`: Your time: {viewerTime}
- `qv.election.invited`: You are invited to vote.
- `qv.election.contests`: {count, plural, one {# question} other {# questions}}
- `qv.election.roll`: {count, plural, one {# eligible voter} other {# eligible voters}}
- `qv.election.v1.ask`: Before you start: ask your organizer for the Election ID they sent you separately. Does it match the ID above?
- `qv.election.v1.match`: Yes, it matches
- `qv.election.v1.mismatch`: It doesn't match
- `qv.election.v1.none`: I don't have it
- `qv.election.v1.confirmed`: Election ID confirmed on this device.
- `qv.election.v1.typeIt`: Type the Election ID you were given
- `qv.election.notFound`: We could not find this election on this server.
- `qv.election.langNotice`: This election is written in {languages}.

## Privacy panel (More details)

- `qv.privacy.headline` **[normative]**: Your choices are secret. The fact that you voted is not.
- `qv.privacy.g1` **[normative]**: Your ballot is locked on your own device before it is sent. The server, the organizers and other members only ever see the locked version.
- `qv.privacy.g2` **[normative]**: Nobody can open a single ballot alone. Opening needs {t} of the {n} trustees ({trustee_names, list}) working together, and they open only the combined total.
- `qv.privacy.g3` **[normative]**: Anyone can check the count. The locked ballots, the proofs and the result are published, and free software can re-check them without trusting the server or the organizers.
- `qv.privacy.g4` **[normative]**: If you change your mind, you can vote again before the vote closes. Only your newest ballot counts.
- `qv.privacy.public` **[normative]**: Visible to everyone who can see this election: that you voted, when, and your ballot code. Not visible: what you chose.
- `qv.privacy.notclaimed.head` **[normative]**: What this does not protect
- `qv.privacy.nc1` **[normative]**: If {t} or more trustees secretly work together, they could read individual ballots.
- `qv.privacy.nc2` **[normative]**: If your phone or computer is infected or being watched, someone could see or change what you pick before it is locked. Testing your ballot (see "Test this ballot") can catch some of this, not all.
- `qv.privacy.nc3` **[normative]**: If someone makes you vote a certain way or watches you vote, this system cannot stop them. Voting again later is the only protection offered, and only while the vote is open.
- `qv.privacy.nc4` **[normative]**: This vote is not anonymous about participation. Others can see that you voted.
- `qv.privacy.nc5` **[normative]**: Your internet provider, and the server, can see that your device connected to this site. Using Tor Browser hides this from them.
- `qv.privacy.nc6` **[normative]**: If everyone who voted picks the same option, others can tell how everyone voted. Very small groups reveal more.
- `qv.privacy.nc7` **[normative]**: Today's locks are expected to hold against current computers. A future, much more powerful computer could in theory open recorded ballots later.
- `qv.privacy.review` **[normative]**: This system has {status, select, reviewed {been independently reviewed by {reviewer} on {date}} other {not yet been independently reviewed}}.
- `qv.privacy.why` **[normative]**: Why can't I just trust this?
- `qv.privacy.whyBody` **[normative]**: This page is delivered by a server. A dishonest server could send you software that behaves differently. That is why the count can be checked by free software you run yourself, why you can test your ballot before casting it, and why you can compare this page with the official release.

## Voting key (step 2)

- `qv.key.local` **[normative]**: Your voting key is created and kept on this device. We cannot see it and cannot recover it for you.
- `qv.key.backup` **[normative]**: Save a backup file. If you lose this key before you vote, you may not be able to vote until your organizer helps you get a new one.
- `qv.key.residual` **[normative]**: A voting page can only be trusted as far as the software it came from. If your device has malware, if a browser extension reads the page, or if the server sends you altered software and you never test a ballot, your choice could be seen or changed. This system does not protect against that.
- `qv.key.title`: Your voting key
- `qv.key.optCreate`: Create a new voting key on this device
- `qv.key.optImport`: Use a key file I saved before
- `qv.key.optCli`: Use a different device for voting (command-line)
- `qv.key.cliHelp`: Install the command-line tool, verify its signature, then run "quietvote vote" with the invitation link. This page cannot help further.
- `qv.key.chooseFile`: Key file
- `qv.key.passphrase`: Passphrase
- `qv.key.passphraseHint`: At least 12 characters, or 6 words from the word list. Pasting and password managers work.
- `qv.key.passphraseNew`: Choose a passphrase
- `qv.key.show`: Show passphrase
- `qv.key.generate`: Generate 7 words for me
- `qv.key.generated`: Write these words down. They are your passphrase: {words}
- `qv.key.pp.tooShort`: Use at least 12 characters, or 6 words from the word list.
- `qv.key.pp.commonPattern`: That is easy to guess. Add more characters or use generated words.
- `qv.key.pp.repetitive`: That repeats too much. Use more different characters or words.
- `qv.key.pp.strength`: Estimated strength: about {bits} bits.
- `qv.key.create`: Create key
- `qv.key.unlock`: Unlock key
- `qv.key.working`: Working. Your passphrase is being turned into a lock. This can take a few seconds.
- `qv.key.fingerprint`: Key fingerprint: {words}
- `qv.key.fingerprintHelp`: Compare these words with the voter list after it is published.
- `qv.key.download`: Download key file
- `qv.key.showRecovery`: Show recovery code
- `qv.key.recoveryHead`: Recovery code
- `qv.key.recoveryHelp`: Write this code on paper. It is shown once. Anyone who has it can vote as you.
- `qv.key.recoveryHide`: I have written it down
- `qv.key.saved`: Backup saved
- `qv.key.mustBackup`: Save a key file or write down the recovery code before you vote.
- `qv.key.persistDenied`: This browser may delete your key without warning. Download the key file and keep it safe.
- `qv.key.floorWarn`: This device is short on memory, so the key lock is weaker than usual. Use a longer passphrase.
- `qv.key.locked`: Your key is locked.
- `qv.key.lockWarn`: Your key will lock in {seconds, plural, one {# second} other {# seconds}} because of inactivity.
- `qv.key.stayUnlocked`: Stay unlocked
- `qv.key.lockNow`: Lock key now
- `qv.key.registered`: Your key is registered. The organizer will add it to the voter list.
- `qv.key.onRoll`: You are on the voter list.
- `qv.key.notYetRoll`: Your key is not on the voter list yet.
- `qv.key.noInvite`: This link has no invitation in it. Ask your organizer for the full link.
- `qv.key.importMissing`: Choose a key file first.
- `qv.key.importBad`: That file is not a QuietVote key file.
- `qv.key.recoveryImport`: Restore from recovery code
- `qv.key.recoveryBad`: That recovery code does not check out. Check each group against your paper.
- `qv.key.forget`: Clear this device
- `qv.key.forgetConfirm`: Remove my key, receipts and drafts from this browser
- `qv.key.forgetBody`: This removes your voting key, receipts and drafts from this browser. Make sure you have a key file or recovery code first.
- `qv.key.cancel`: Cancel

## Ballot

- `qv.ballot.title`: Your ballot
- `qv.ballot.chooseOne`: Choose one
- `qv.ballot.chooseUpTo`: Choose up to {k, plural, one {# option} other {# options}}
- `qv.ballot.chooseAny`: Choose any number of options
- `qv.ballot.blank`: Abstain / blank
- `qv.ballot.blankRule`: A blank ballot counts toward quorum only if the rules say so.
- `qv.ballot.counter`: {selected} of {max} selected
- `qv.ballot.undervote`: You've selected fewer than the maximum. That is allowed.
- `qv.ballot.review`: Review my choices
- `qv.ballot.backRules`: Back to rules
- `qv.ballot.reviewTitle`: Review your choices
- `qv.ballot.reviewPrivate`: Your choices (only you can see this screen) — hidden from the receipt and from this device after you leave.
- `qv.ballot.change`: Change choice for {contest}
- `qv.ballot.changeShort`: Change
- `qv.ballot.noChoice`: No choice
- `qv.ballot.seal`: Seal my ballot
- `qv.ballot.sealHelp`: This locks your choices on this device. Nothing is sent yet.
- `qv.ballot.sealing`: Sealing your ballot on this device…
- `qv.ballot.sealed`: Your ballot is sealed.
- `qv.ballot.sealedAnnounce`: Ballot sealed. The code is on screen.
- `qv.ballot.code`: Ballot code
- `qv.ballot.codeHelp`: This code is a fingerprint of your sealed ballot. It was created before you chose below.
- `qv.ballot.choose`: Choose what to do next
- `qv.ballot.cast`: Send my vote
- `qv.ballot.castHelp`: Send it now. You will get a receipt.
- `qv.ballot.test`: Double-check this vote
- `qv.ballot.testHelp`: Optional. See that this vote says what you chose. This practice vote is thrown away. Then you lock a fresh one.
- `qv.ballot.unconfirmedReminder`: You haven't confirmed the Election ID yet. Compare it with the one your organizer gave you before you cast.
- `qv.ballot.testing`: Opening your test ballot…
- `qv.ballot.casting`: Sending your ballot…
- `qv.ballot.newSeal`: Seal a new ballot
- `qv.ballot.newCodeDifferent`: The new code is different. That's expected.
- `qv.ballot.firstTimeAudit`: Your device cannot prove it sealed the right choices unless you test a ballot. Testing is optional and takes a minute.
- `qv.ballot.nothingYet`: Nothing has been sent to the server.
- `qv.ballot.readSlowly`: Read the code aloud slowly
- `qv.ballot.revoteNote`: You can vote again before the vote closes. Only your newest ballot counts.
- `qv.ballot.oneBallot`: This election allows one ballot per person.
- `qv.ballot.closingSoon`: Closing in less than 1 minute — submit now or it won't count.

## Vote screen

- `qv.vote.privacyNote`: Your choices stay secret. Everyone can see that you voted.
- `qv.vote.moreDetails`: More details
- `qv.vote.keyWhat`: Your voting key is a secret code on this device. It proves you are allowed to vote.
- `qv.vote.codeWhat`: Your ballot code is a short name for your locked vote. You can use it to find your vote later.
- `qv.vote.doubleCheck`: Double-check that this vote says what you chose
- `qv.vote.optional`: This step is optional.

## Double-check step (optional)

- `qv.audit.title`: Practice vote opened
- `qv.audit.why` **[normative]**: Your device locks your choices. A test lets you check that it locked the choices you picked, and not something else. A tested ballot is thrown away and cannot be cast.
- `qv.audit.public` **[normative]**: A test ballot is posted to the public record, but what it contained stays on your device unless you choose to publish it. Don't test with choices you want to keep private, and never cast a ballot you have tested.
- `qv.audit.publishReveal` **[normative]**: Also publish what this test ballot contained. Everyone will then see these choices.
- `qv.audit.ok` **[normative]**: This test ballot matched what you picked. That is good, but it only tells you about this one test. Testing more than once makes tampering less likely to go unnoticed.
- `qv.audit.mismatch` **[normative]**: Something does not match. Do not cast. Save the evidence below and tell your organizer and an independent observer. Use a different device if you can.
- `qv.audit.sealedAs`: What your device sealed
- `qv.audit.contest`: Contest
- `qv.audit.choice`: Chosen
- `qv.audit.autoChecks`: Automatic checks on this page
- `qv.audit.check.code`: The opened ballot matches the code shown before you chose
- `qv.audit.check.proofs`: The proofs on the ballot are valid
- `qv.audit.check.plain`: The sealed ballot was built from exactly the choices shown
- `qv.audit.sameSoftware`: These checks run in the same software that sealed your ballot. A second device or the standalone verifier is the independent check.
- `qv.audit.matchQ`: Do these match what you picked?
- `qv.audit.matchYes`: Yes
- `qv.audit.matchNo`: No – something is wrong
- `qv.audit.secondDevice`: Check on a second device
- `qv.audit.secondDeviceHelp`: Open the checker on another device. Load this file or link. It rebuilds your vote and compares it.
- `qv.audit.download`: Download audit file
- `qv.audit.link`: Audit link
- `qv.audit.posted`: The test ballot was posted to the public record.
- `qv.audit.notPosted`: The test ballot was not posted.
- `qv.audit.postOpt`: Post the test ballot to the public record
- `qv.audit.evidence`: Save evidence

## Receipt

- `qv.receipt.title`: Your vote was recorded. Here is your receipt.
- `qv.receipt.proves` **[normative]**: This receipt proves your ballot was received and recorded in the public log, and lets anyone (including you) check that it has not been removed or changed.
- `qv.receipt.doesnt` **[normative]**: It does not show what you chose, and it cannot be used to prove to anyone else how you voted.
- `qv.receipt.shared` **[normative]**: Anyone who sees this receipt can tell that you voted.
- `qv.receipt.logged`: Logged {time}, entry #{seq}
- `qv.receipt.save`: Save receipt file
- `qv.receipt.print`: Print
- `qv.receipt.checkNow`: Check inclusion now
- `qv.receipt.clearDevice`: Clear this device
- `qv.receipt.pendingTitle`: Waiting for confirmation
- `qv.receipt.pendingBody`: Your ballot was sent but the record has not confirmed it yet. Do not vote again yet. You can check again safely.
- `qv.receipt.dupTitle`: Already recorded
- `qv.receipt.supersededTitle`: Replaced by a newer ballot
- `qv.receipt.rejectedTitle`: Not accepted
- `qv.receipt.afterCloseTitle`: Voting had closed
- `qv.receipt.checkTitle`: Check a receipt
- `qv.receipt.enterCode`: Ballot code
- `qv.receipt.orFile`: Or choose a receipt file
- `qv.receipt.check`: Check
- `qv.receipt.included`: Included in the public record at entry #{seq} (record size {size}).
- `qv.receipt.consistent`: The record is consistent with the version you saw before.
- `qv.receipt.notFound`: Not found (yet). A new ballot can take up to a minute to appear. Try again shortly.
- `qv.receipt.stored`: Receipts saved on this device
- `qv.receipt.none`: No receipts are saved on this device.
- `qv.receipt.remember`: Remember receipts on this device
- `qv.receipt.qrMissing`: A QR code is not available in this version. Use the Save button.
- `qv.receipt.standing.title`: Status of this ballot
- `qv.receipt.standing.current`: Latest. No newer ballot from you is in the public record.
- `qv.receipt.standing.superseded`: Replaced. Your newer ballot at entry #{seq} counts instead of this one.
- `qv.receipt.standing.supersededNote`: This receipt still shows that the earlier ballot was recorded. Only your newest ballot is counted.
- `qv.receipt.standing.unknown`: Not checked yet. This ballot is not in the record loaded on this page.
- `qv.receipt.standing.mismatch`: This receipt does not match the public record. Check it again, or ask the organizer.

## Results

- `qv.results.title`: Results
- `qv.results.notYet`: Results appear after voting closes and the trustees open the total.
- `qv.results.option`: Option
- `qv.results.count`: Votes
- `qv.results.participation`: {count, plural, one {# voter} other {# voters}} took part.
- `qv.results.quorum`: Quorum: {met, select, true {met} other {not met}}.
- `qv.results.outcome.passed`: Passed
- `qv.results.outcome.rejected`: Rejected
- `qv.results.outcome.no-quorum`: No quorum
- `qv.results.outcome.tie`: Tie
- `qv.results.outcome.winners`: Winners: {names, list}
- `qv.results.how`: How do I know this is correct?
- `qv.results.howBody`: Download the election bundle and run it through the standalone verifier or the command-line verifier. Do not rely on this page alone.
- `qv.results.summary`: Summary: {text}
- `qv.results.chartLabel`: Bar chart: votes for each option in {title}. The same numbers are in the table.
- `qv.results.barValue`: {count, plural, one {# vote} other {# votes}} ({share, number, percent})
- `qv.results.barCount`: {count, plural, one {# vote} other {# votes}}
- `qv.results.winnerTag`: Winner

## Live updates

- `qv.live.connecting`: Connecting to live updates…
- `qv.live.live`: Live updates are on.
- `qv.live.reconnecting`: Live updates paused. Trying again in {seconds, plural, one {# second} other {# seconds}}.
- `qv.live.failed`: Live updates are off. Reload the page to see new activity.
- `qv.live.updated`: The public record changed. This page is up to date.
- `qv.live.alert`: The record reported a problem and may be paused. Do not rely on live updates.

## Errors

- `qv.err.reference`: Reference: {code} {request}
- `qv.err.E-NET-OFFLINE.title`: You're offline
- `qv.err.E-NET-OFFLINE.body`: Nothing has been sent. Your choices are still on this screen.
- `qv.err.E-NET-TIMEOUT.title`: We're not sure your ballot arrived
- `qv.err.E-NET-TIMEOUT.body`: Don't vote again yet. Check status first — it's safe to retry.
- `qv.err.E-VOT-NOTONROLL.title` **[normative]**: This key isn't on the voter list
- `qv.err.E-VOT-NOTONROLL.body` **[normative]**: Ask your organizer to check the list. Don't share your key file.
- `qv.err.E-VOT-CLOSED.title`: Voting has closed
- `qv.err.E-VOT-CLOSED.body`: Your ballot was not counted. Voting closed at {time}.
- `qv.err.E-VOT-NOTOPEN.title`: Voting opens {time}
- `qv.err.E-VOT-NOTOPEN.body`: Come back when voting opens.
- `qv.err.E-VOT-OVERVOTE.title`: Too many choices
- `qv.err.E-VOT-OVERVOTE.body`: You can choose up to {k}. You've chosen {x}.
- `qv.err.E-VOT-ONEBALLOT.title`: You've already voted
- `qv.err.E-VOT-ONEBALLOT.body`: This election allows one ballot per person. Your first ballot counts.
- `qv.err.E-VOT-REJECTED-PROOF.title`: Your ballot couldn't be accepted
- `qv.err.E-VOT-REJECTED-PROOF.body`: Your device produced a ballot that failed the checks. Nothing was recorded. Reload this page and try again; if it happens again, report it with the reference.
- `qv.err.E-VOT-DUP.title`: This exact ballot is already recorded
- `qv.err.E-VOT-DUP.body`: It was already counted. Show your receipt to check it.
- `qv.err.E-VOT-SUPERSEDED-LOST.title`: A newer ballot from you is already recorded
- `qv.err.E-VOT-SUPERSEDED-LOST.body`: The older ballot was not counted.
- `qv.err.E-KEY-LOCKED.title`: That passphrase didn't unlock the key
- `qv.err.E-KEY-LOCKED.body`: Check the passphrase and try again, or restore from your backup.
- `qv.err.E-KEY-LOST.title`: We can't recover your key
- `qv.err.E-KEY-LOST.body`: Nobody can, by design. Ask your organizer about issuing a replacement.
- `qv.err.E-KEY-STORAGE.title`: This browser won't store your key
- `qv.err.E-KEY-STORAGE.body`: Download the key file now and use it each time.
- `qv.err.E-BOARD-STALE.title`: The record hasn't updated since {time}
- `qv.err.E-BOARD-STALE.body`: Availability may be affected. The integrity of what is already recorded is not.
- `qv.err.E-BOARD-FORK.title` **[normative]**: The public record doesn't agree with itself
- `qv.err.E-BOARD-FORK.body` **[normative]**: Two different versions were shown. Do not rely on results from this server. Save the evidence and tell an independent observer.
- `qv.err.E-BOARD-INCL-FAIL.title` **[normative]**: Your receipt doesn't match the record
- `qv.err.E-BOARD-INCL-FAIL.body` **[normative]**: Save the evidence and report it to your organizer and an independent observer.
- `qv.err.E-BOARD-ROLLBACK.title` **[normative]**: The public record went backwards
- `qv.err.E-BOARD-ROLLBACK.body` **[normative]**: The server showed a shorter record than one you saw before. Save the evidence and tell an independent observer.
- `qv.err.E-CLIENT-HASH.title` **[normative]**: This page is not the official version
- `qv.err.E-CLIENT-HASH.body` **[normative]**: Don't vote here. Compare with the official release hash.
- `qv.err.E-ORG-QUORUM.title`: That quorum can't be reached
- `qv.err.E-ORG-QUORUM.body`: The quorum is larger than the number of voters.
- `qv.err.E-ORG-TRUSTEES.title`: Trustee setup isn't valid
- `qv.err.E-ORG-TRUSTEES.body`: Check the number of trustees, the threshold and that no key is repeated.
- `qv.err.E-ORG-LANG.title`: A translation is missing
- `qv.err.E-ORG-LANG.body`: Add the {lang} text for every option, or remove that language.
- `qv.err.E-ORG-MANIFEST.title`: The election setup isn't valid
- `qv.err.E-ORG-MANIFEST.body`: {detail}
- `qv.err.E-ORG-STATE.title`: Publishing lost its place
- `qv.err.E-ORG-STATE.body`: Reload this page. If an election ID was shown, keep it and ask your administrator before you publish again.
- `qv.err.E-ORG-INVITE-REPLAY.title`: Some invitation links can't be shown again
- `qv.err.E-ORG-INVITE-REPLAY.body`: The server shows each code only once. Publish again to issue new invitations. The earlier ones stay valid.
- `qv.err.E-VER-FAIL.title` **[normative]**: Check {id} failed
- `qv.err.E-VER-FAIL.body` **[normative]**: The result is not established. Export the evidence and report it.
- `qv.err.E-VER-ANCHOR.title` **[normative]**: This doesn't match the Election ID you entered
- `qv.err.E-VER-ANCHOR.body` **[normative]**: You may be examining a different election. Stop and check where you got the file.
- `qv.err.E-GEN-UNSUPPORTED.title`: This browser can't vote here
- `qv.err.E-GEN-UNSUPPORTED.body`: Use a newer browser or the command-line voter.
- `qv.err.E-GEN-UNKNOWN.title`: Something went wrong
- `qv.err.E-GEN-UNKNOWN.body`: Your ballot has not been sent unless you saw a receipt.
- `qv.err.E-API-RATE.title`: Too many requests
- `qv.err.E-API-RATE.body`: Wait {seconds, plural, one {# second} other {# seconds}} and try again.
- `qv.err.E-API-UNAVAILABLE.title`: The server can't take new entries right now
- `qv.err.E-API-UNAVAILABLE.body`: Reading still works. Try again in a minute.
- `qv.err.E-VERSION.title`: This election needs a different version of QuietVote
- `qv.err.E-VERSION.body`: It uses protocol {protocol}. Get a release that supports it from the official release page.
- `qv.err.E-READ-KEY.title`: This election needs a read key
- `qv.err.E-READ-KEY.body`: Ask your organizer for the complete link.

## Anti-phishing

- `qv.phish.mismatch` **[normative]**: Stop. This Election ID does not match the one you were given. You may be on a copy of the real site. Don't enter anything. Tell your organizer, and use the link or ID they gave you in person or by another channel.
- `qv.phish.unconfirmed` **[normative]**: You haven't confirmed the Election ID yet.
- `qv.phish.verifierwarn` **[normative]**: A checker you didn't download or compare yourself can lie. See "How to trust a verifier".
- `qv.phish.neverask` **[normative]**: We will never ask for your voting key file or passphrase by email, chat, or on any page other than the one that created it.

## Glossary

- `qv.glossary.electionId` **[normative]**: A short fingerprint of this election's rules. If it matches what your organizer told you separately, you are in the right election.
- `qv.glossary.ballotCode` **[normative]**: A fingerprint of your locked ballot. Used to find it in the public log.
- `qv.glossary.trustee` **[normative]**: One of several people who each hold part of the key that opens the final total.
- `qv.glossary.publicLog` **[normative]**: A list of everything that happened in this election, that anyone can download and check.
- `qv.glossary.verifier` **[normative]**: Free software that re-checks the public log without trusting anyone.
- `qv.glossary.superseded` **[normative]**: Replaced by a newer ballot from the same voter.

## Step indicator

- `qv.step.of`: Step {current} of {total}: {name}
- `qv.step.check`: Check the election
- `qv.step.key`: Get your voting key
- `qv.step.choose`: Make your choices
- `qv.step.send`: Send your vote

## Device

- `qv.device.shared` **[normative]**: On a shared or public computer? Choose "Clear this device" when you finish. This removes your voting key, receipts and drafts from this browser.
- `qv.device.cleared` **[normative]**: This device has been cleared. If you saved your receipt file, you can still check your ballot later.

## Status chips

- `qv.status.draft`: Draft
- `qv.status.ceremony`: Setting up keys
- `qv.status.ready`: Ready
- `qv.status.open`: Open
- `qv.status.closed`: Closed
- `qv.status.tallied`: Result published
- `qv.status.unknown`: Unknown
- `qv.status.paused`: Paused
- `qv.status.invalidated`: Cancelled

## Verify an election

- `qv.verify.title`: Verify an election
- `qv.verify.scope` **[normative]**: Passing these checks means the public record is internally consistent and the count follows from the locked ballots. It does not prove that your own device locked your choice correctly unless you tested a ballot, and it does not protect against anything listed under "What this does not protect".
- `qv.verify.itemized` **[normative]**: {passed} of {total} checks passed.
- `qv.verify.source`: Where is the election data?
- `qv.verify.sourceFile`: A file I downloaded
- `qv.verify.sourceServer`: This server
- `qv.verify.file`: Election bundle file (JSON)
- `qv.verify.anchor`: Election ID you were told (from your organizer, not from this page)
- `qv.verify.anchorHint`: Optional but strongly recommended. Without it, a copy of a different election would also pass.
- `qv.verify.run`: Run checks
- `qv.verify.running`: Running checks…
- `qv.verify.verdict.PASS`: All checks passed
- `qv.verify.verdict.FAIL`: A check failed
- `qv.verify.verdict.INCOMPLETE`: Incomplete: no result has been published yet
- `qv.verify.status.pass`: passed
- `qv.verify.status.fail`: failed
- `qv.verify.status.not_run`: not run
- `qv.verify.checks`: Checks
- `qv.verify.findings`: Details
- `qv.verify.jumpFail`: Jump to first failure
- `qv.verify.download`: Download report (JSON)
- `qv.verify.selfTest`: Run verifier self-test
- `qv.verify.selfTestOk`: Self-test passed: the known-bad sample was rejected as expected.
- `qv.verify.selfTestBad`: Self-test FAILED: this verifier accepted a known-bad sample. Do not trust it.
- `qv.verify.verifierWarn` **[normative]**: A checker you didn't download or compare yourself can lie. See "How to trust a verifier".
- `qv.verify.counts`: {cast} ballots cast, {counted} counted, {spoiled} test ballots opened.
- `qv.verify.offlineNote`: This page makes no network requests. You can disconnect before you load a bundle.
- `qv.verify.chk.chk.manifest.hash`: Manifest hash
- `qv.verify.chk.chk.manifest.sig`: Organizer signature on the manifest
- `qv.verify.chk.chk.keys.trustees`: Trustee keys and joint key proofs
- `qv.verify.chk.chk.board.append_only`: The record is an append-only log
- `qv.verify.chk.chk.board.witness`: Witness cosignatures
- `qv.verify.chk.chk.ballots.valid`: Every ballot: voter on the list, signature and proofs valid
- `qv.verify.chk.chk.ballots.latest`: Latest ballot per voter applied
- `qv.verify.chk.chk.tally.aggregate`: Locked ballots add up to the published total
- `qv.verify.chk.chk.tally.decrypt`: Trustee decryption proofs are valid
- `qv.verify.chk.chk.result.rules`: Result follows from the rules
- `qv.verify.chk.chk.benaloh.spoiled`: Test ballots opened by voters are consistent
- `qv.verify.chk.chk.receipts.sample`: Sampled receipts
- `qv.verify.chk.chk.encoding.canonical`: Everything is encoded canonically
- `qv.verify.chk.chk.time.window`: Ballots fall inside the voting window

## Organizer

- `qv.org.title`: Create an election
- `qv.org.step.basics`: Basics
- `qv.org.step.rules`: Rules
- `qv.org.step.ballot`: Ballot
- `qv.org.step.voters`: Voters
- `qv.org.step.trustees`: Trustees
- `qv.org.step.review`: Review and freeze
- `qv.org.name`: Name of decision
- `qv.org.description`: Description (shown to voters)
- `qv.org.zone`: Time zone of this election
- `qv.org.zoneHint`: Closing times are shown in this zone and in each voter's own zone.
- `qv.org.template`: Voting method
- `qv.org.tpl.yes-no`: Yes / No
- `qv.org.tpl.single-choice`: Choose one
- `qv.org.tpl.approval`: Approve any
- `qv.org.tpl.k-of-n`: Choose up to k
- `qv.org.question`: Question
- `qv.org.options`: Options (one per line)
- `qv.org.k`: Maximum choices (k)
- `qv.org.passRule`: Pass rule
- `qv.org.rule.majority`: Simple majority of votes cast
- `qv.org.rule.twoThirds`: At least 2/3 of votes cast
- `qv.org.quorum`: Require at least this many voters (0 for none)
- `qv.org.opens`: Voting opens
- `qv.org.closes`: Voting closes
- `qv.org.maxBallots`: Most ballots one voter may cast (1 turns revoting off)
- `qv.org.roll`: Voter public keys
- `qv.org.rollHelp`: One 64-character hexadecimal public key per line. You can add a label after a comma.
- `qv.org.rollFile`: Or choose a text or CSV file
- `qv.org.rollSummary`: {count, plural, one {# voter key} other {# voter keys}}. Roll root {root}.
- `qv.org.rollRow`: Row {row}: {problem}
- `qv.org.rollDup`: this key appears more than once
- `qv.org.rollBadHex`: not a 64-character hexadecimal key
- `qv.org.rollBadKey`: not a valid Ed25519 public key
- `qv.org.trustees`: Trustees
- `qv.org.trusteeLabel`: Trustee {index} name
- `qv.org.trusteeKey`: Trustee {index} signing key (hex)
- `qv.org.threshold`: Trustees needed to open the total (t)
- `qv.org.trustee.warning` **[normative]**: Choose trustees who do not all answer to the same person. If {t} trustees work together, they can read every ballot. If more than {n_minus_t} trustees become unavailable, the result cannot be opened.
- `qv.org.freeze` **[normative]**: Once you freeze this election, its question, options, rules, voter list and trustees cannot be changed. If you find a mistake later, you will need to create a corrected election and cancel this one in public.
- `qv.org.freezeCheck`: I have read the plain-language rules as voters will see them
- `qv.org.freezeConfirm`: Freeze election
- `qv.org.export` **[normative]**: Download everything. The record of this election is yours, and you can run it anywhere.
- `qv.org.nopeek` **[normative]**: Organizers cannot see how anyone voted, and cannot see partial results. That is by design.
- `qv.org.preview`: What voters will read
- `qv.org.previewRule`: {method} — {question}
- `qv.org.keyTitle`: Organizer key
- `qv.org.keyHelp`: Your organizer key signs the manifest and the open and close entries. It is kept on this device like a voting key.
- `qv.org.announce`: Election ID {id}. Send it to voters through a different channel from the invitation link.
- `qv.org.open`: Open voting
- `qv.org.close`: Close voting
- `qv.org.opened`: Voting is open.
- `qv.org.closed`: Voting is closed.
- `qv.org.invites`: Create invitation links
- `qv.org.inviteCount`: How many invitations
- `qv.org.inviteList`: Invitation links (shown once)
- `qv.org.dashboard`: Dashboard
- `qv.org.ballotsReceived`: Valid ballots received: {count}
- `qv.org.boardAge`: Last signed record update: {when}
- `qv.org.noPeekButton`: There is no way to view ballots here.
- `qv.org.draftSaved`: Draft saved on this device only.
- `qv.org.dstGap`: That local time does not exist in {zone}. Try {suggestion}.
- `qv.org.dstFold`: That local time happens twice in {zone}. Choose the offset: {offsets, list}.
- `qv.org.instant`: This is {utc} in UTC.
- `qv.org.translateWarn`: Don't paste confidential text into online translators.
- `qv.org.publish`: Publish election
- `qv.org.publishHelp`: Publishing creates the election on the server and posts its signed setup. It does not open voting.
- `qv.org.orgId`: Organization ID
- `qv.org.orgIdHint`: The organization ID your server gave you.
- `qv.org.orgRequired`: Enter the organization ID first.
- `qv.org.publishNoKey`: There is no organizer key on this device. Create one first.
- `qv.org.publishing`: Publishing… keep this page open.
- `qv.org.publishResume`: Publishing stopped before it finished. Press Publish election again to continue from the same point.
- `qv.org.published`: Election published. Its ID is {id}.
- `qv.org.publishInvites`: Invitation links are shown once. Save them before you leave this page.
- `qv.org.trusteeFormat`: name, signing key hex
- `qv.org.logPublicKeyLabel`: Log public key (hex)
- `qv.org.invalidDate`: invalid date

## Help

- `qv.help.title`: Help and accessibility
- `qv.help.keyboard`: Everything works with the keyboard. There are no single-key shortcuts. Use Tab and Shift+Tab to move, Enter or Space to activate, and the arrow keys inside option groups.
- `qv.help.screenReader`: The page announces important changes in one polite and one urgent message area. Codes are written in groups so a screen reader can read them one group at a time.
- `qv.help.contrast`: High contrast
- `qv.help.contrastHelp`: Makes text and borders stronger. The page also follows your system contrast, dark mode and reduced-motion settings.
- `qv.help.theme`: Colour theme
- `qv.help.theme.auto`: Follow my device
- `qv.help.theme.light`: Light
- `qv.help.theme.dark`: Dark
- `qv.help.report`: Report a problem
- `qv.help.reportBody`: Tell your organizer, and an independent observer if you think the record has been tampered with. Include the reference shown with any error.
- `qv.help.howVerifier`: How to trust a verifier
- `qv.help.howVerifierBody`: Use at least two independent verifiers, download them from a source other than the election server, and compare their hashes with the signed release manifest.
- `qv.help.about`: About this client
- `qv.help.aboutBody` **[normative]**: The checks that protect this page (integrity hashes and a strict content policy) defend against partial compromise such as a damaged cache or mirror. They do not protect against a server that sends both the page and its hashes. Hosting the page on a different server from the election, and checking releases yourself, are the real defences.
- `qv.help.versionSkew`: This election uses protocol {protocol}, which this client does not support.
- `qv.help.translating`: Your browser appears to be translating this page. Translation tools may send what you see here to another company. Turn translation off for this page or use {language} in the language menu.
- `qv.help.clockOff`: Your device clock is {delta, plural, one {# second} other {# seconds}} off.

## Navigation

- `qv.nav.home`: Home
- `qv.nav.rules`: Rules and privacy
- `qv.nav.vote`: Vote
- `qv.nav.receipt`: Check a receipt
- `qv.nav.results`: Results
- `qv.nav.verify`: Verify an election
- `qv.nav.admin`: Organizer console
- `qv.nav.create`: Create an election

## Accessibility names

- `qv.a11y.checkPassed`: {name}: passed
- `qv.a11y.checkFailed`: {name}: failed
- `qv.a11y.checkNotRun`: {name}: not run
- `qv.a11y.table`: Showing {from}–{to} of {total}
- `qv.a11y.working`: Working
