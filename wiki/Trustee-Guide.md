# Trustee Guide

> **Draft – unaudited software, not for real elections yet.** The trustee tool (`qv-trustee`) exists in the repository and is tested with simulated parties. It has not been run in a live key ceremony. This page describes the planned role.

## What a trustee does

Trustees share the power to open a vote's total. Each trustee holds one **share** (one piece of the key). Any *t* of the *n* trustees can open the **total** (the combined count). Fewer than *t* learn nothing about the ballots. See spec [17](https://github.com/djshellshoxxx/quietvote/blob/main/docs/17-key-ceremony-trustees.md) section 1 and spec [16](https://github.com/djshellshoxxx/quietvote/blob/main/docs/16-crypto-protocol.md).

**Remember:** *t* trustees **could** open single ballots if they chose to. So trustees must be truly independent. This is a key assumption.

## Your jobs

1. **Join.** Accept the role. Set up your signing and transport keys (spec 17 section 7).
2. **Take part in the key ceremony.** This is the ceremony where the shared key is made. It can be online or on an offline (air-gapped) computer. Follow the runbooks in section 8. Check the record (transcript) that it produces.
3. **Keep your share safe.** Store it encrypted, with a backup. Protect it with a passphrase or a hardware token. Do not copy it to unprotected places (section 6).
4. **Count.** When the vote closes, give your decryption share. At least *t* trustees must respond.
5. **Destroy your share.** After the audit window ends, destroy your share and sign a statement that you did (section 11).

## If something goes wrong

- If one trustee is missing, the count can still finish, as long as enough others respond. You can miss up to *n − t* trustees.
- If a share is lost or stolen, follow section 9 of spec 17.

## Suggested settings

| Group size | Trustees (n, t) |
|---|---|
| Up to 50 | 3, 2 (minimum recommended) |
| 50 to 500 | 5, 3 |

Full table and reasons: spec 17 section 5.
