# Trustee Guide

> **Draft – unaudited software.** The trustee tool is not yet built. This page describes the intended role.

## What a trustee does

Trustees jointly hold the decryption capability for an election. Each trustee holds one **share**. Any *t* of the *n* trustees can decrypt the **aggregate tally**. Any *t-1* learn nothing about the ballots. See [spec 17](https://github.com/djshellshoxxx/quietvote/blob/main/docs/17-key-ceremony-trustees.md) section 1 and [spec 16](https://github.com/djshellshoxxx/quietvote/blob/main/docs/16-crypto-protocol.md).

Note that *t* trustees could decrypt individual ballots if they chose to. Trustee independence is therefore a key assumption.

## Your duties

1. **Onboarding.** Accept the role and set up your signing and transport keys ([spec 17](https://github.com/djshellshoxxx/quietvote/blob/main/docs/17-key-ceremony-trustees.md) section 7).
2. **Key ceremony.** Take part in the key generation ceremony, online or air-gapped, following the runbooks in section 8. Verify the transcript.
3. **Keep your share safe.** Store it encrypted, with a backup, under a passphrase or hardware token. Do not copy it to unprotected places (section 6).
4. **Tally.** Provide your decryption share when the election closes. At least *t* trustees must respond.
5. **Key destruction.** After the audit window, destroy your share and sign the attestation (section 11).

## If something goes wrong

- If a trustee is absent, the tally can still complete as long as enough others respond (absence tolerance is *n-t*).
- If a share is lost or compromised, follow section 9 of spec 17.

## Recommended settings

| Group size | Trustees (n, t) |
|---|---|
| Up to 50 | 3, 2 (minimum recommended) |
| 50 to 500 | 5, 3 |

Full table and reasoning: [spec 17](https://github.com/djshellshoxxx/quietvote/blob/main/docs/17-key-ceremony-trustees.md) section 5.
