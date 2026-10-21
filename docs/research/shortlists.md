# Shortlists: verifier authors, fiscal hosts, counsel options

Date: 2026-10-21

**Caveat.** This is not legal advice. Every entry below is an unverified candidate until the project owner vets it. The lists are neutral: they record facts and sources, and make no recommendation. Where a page could not be fetched directly, the entry says the fact comes from a search result snippet. Where no source was found, the entry says "not found" rather than guessing.

---

## (A) Second independent verifier author candidates

Entries are public research groups or open-source verifier projects. No personal contact details are listed. Contact pages are given as organisation or project pages only.

| # | Candidate | Public verifier / project | Language and stack (as stated) | License (as stated) | Public contact / project page | Sources |
|---|---|---|---|---|---|---|
| A1 | Helios (Helios voting system; Helios server project) | Helios server; separate HeliosVerifier application (github.com/domfre/helios_verifier) for Helios v4 spec elections | Helios server repo tagged javascript and python (GitHub). HeliosVerifier language not stated in sources found. | Helios server: Apache-2.0 (GitHub page) | Project website heliosvoting.org (linked from GitHub page). No contact address listed on the repo page. | https://github.com/benadida/helios-server ; https://helios-verifier.readthedocs.io ; https://cs.carleton.edu/cs_comps/2021/votingmachines/final-results/heliosBasics.html |
| A2 | Belenios (Inria-hosted project) | belenios-tool (command-line tool and web server; the auditor guide describes running verification checks with it) | OCaml and JavaScript (per search snippet). Debian packaging lists OCaml build dependencies. | AGPL-3.0 (GitLab repo metadata via search result) | Source at gitlab.inria.fr/belenios/belenios; project site belenios.org (could not be fetched; listed from search results). No contact listed in sources found. | https://repos.data.code.gouv.fr/hosts/gitlab.inria.fr/repositories/belenios%2Fbelenios ; https://ocaml.org/success-stories/secure-and-verifiable-online-voting-platform ; https://tracker.debian.org/media/packages/b/belenios/control-2.0dfsg-1 |
| A3 | Verificatum (Verificatum mix-net project) | verificatum-vmn (distributed verifiable mix-net based on ElGamal); verificatum-vcr (core routines and tools) | verificatum-vmn and verificatum-vcr: Java. verificatum-vec: C. verificatum-gmpmee: C. verificatum-vjsc: JavaScript (TypeScript version stated as planned). verificatum-vmgj: M4. Julia compatible verifier ShuffleProofs.jl also exists per search result. | Not stated on the pages fetched | Website https://www.verificatum.org ; GitHub org https://github.com/verificatum. No contact email or contact link listed on the website (fetched). | https://github.com/verificatum ; https://www.verificatum.org ; https://arxiv.org/pdf/1912.00288 (search result) |
| A4 | ElectionGuard (open-source SDK, Election-Tech-Initiative repo and Python package) | ElectionGuard SDK; ElectionGuard Python implements the spec and supports verifiers | C++ (ElectionGuard Core), Python 3.8+ for docs site, Python (electionguard-python). The repo page language section was empty. | MIT (electionguard and electionguard-python repo pages) | Website https://www.electionguard.vote/ (listed on repo page). Questions via GitHub Discussions (github.com/microsoft/electionguard/discussions) per repo page. Security reports via the SECURITY file (Microsoft CVD process). | https://github.com/Election-Tech-Initiative/electionguard ; https://github.com/Election-Tech-Initiative/electionguard-python ; https://blogs.microsoft.com/on-the-issues/2019/09/24/electionguard-available-today-to-enable-secure-verifiable-voting/ |
| A4b | ElectionGuard Rust reference implementation (Microsoft) | electionguard-rust | Rust. Its README is labelled "INCOMPLETE, EXPERIMENTAL" (per search snippet). | Not stated in sources found | https://github.com/microsoft/electionguard-rust (listed in search results; not fetched) | https://github.com/microsoft/electionguard-rust (search result) |
| A5 | Swiss Post e-voting (Swiss Post, Digital Solutions) | Swiss Post e-voting verification software, published as open source | Not stated in sources found. | Blog states the crypto-primitives library is Apache 2.0. The GitLab group page states no license. A third-party commentator (Christian Folini, per search result) says some components are source-available rather than open-source. | GitLab group https://gitlab.com/swisspost-evoting (fetched; no contact listed). Post blog: https://digital-solutions.post.ch/en/e-government/blog/the-source-code-of-the-future-e-voting-system-is-publicly-accessible | https://gitlab.com/swisspost-evoting ; https://digital-solutions.post.ch/en/e-government/blog/the-source-code-of-the-future-e-voting-system-is-publicly-accessible ; https://digital-solutions.post.ch/en/e-government/blog/disclosure-of-e-voting-system-key-cryptographic-algorithms-published-as-open-source-content (search result) |
| A6 | Free & Fair (VoteSecure SDK) | VoteSecure: cryptographic SDK for end-to-end verifiable internet voting | Rust (per talk abstract on the search result). Developed with Sequent and Verificatum; sponsored by The Mobile Voting Foundation (per Free & Fair description). | Not stated in sources found | GitHub: github.com/FreeAndFair/VoteSecure (search result; not fetched). Project page: https://freeandfair.us/votesecure/ (not fetched). | https://freeandfair.us/votesecure/ (search result) ; https://www.csie.ntu.edu.tw/en/more_announcement/-2025-12-05-Dr-Daniel-Zimmerman-%C2%A0Free-Fair-%C2%A0VoteSecure-An-SDK-for-End-to-End-Verifiable-Internet-Voting-40236281 |
| A7 | Votegral (EPFL, Decentralized Distributed Systems Laboratory, DEDIS) | Votegral: remote voting system presented at SOSP 2025 (per EPFL news) | Not stated in sources found. | Not stated in sources found | EPFL DEDIS lab (epfl.ch/labs/dedis; could not be fetched). Thesis record: https://infoscience.epfl.ch/items/eacaf785-527d-4fdf-95bc-5b025c9de961. EPFL news: https://actu.epfl.ch/news/a-new-prototype-e-voting-system-finally-solves-the/ | https://infoscience.epfl.ch/items/eacaf785-527d-4fdf-95bc-5b025c9de961 ; https://actu.epfl.ch/news/a-new-prototype-e-voting-system-finally-solves-the/ ; https://showcase.c4dt.org/projects/votegral |

**Notes for (A):**
- The Oxford "Dr. Haines" and "Rust" details for Votegral were not confirmed by any source found. This shortlist does not assert them.
- The Galois and Sensus links suggested in the query were not found in any source. They are omitted.
- Verificatum's public "audited" claim appears only in a promotional blog (sota.io) and is not included as a fact.

---

## (B) Fiscal host options for an open-source project

Fiscal hosting is separate from funding (see section B2).

| # | Host | Fee structure (as stated) | Eligibility (as stated) | Notes | Sources |
|---|---|---|---|---|---|
| B1 | Open Source Collective (Open Collective fiscal host) | 10% of funds raised, per Open Source Collective apply page (via search result). Payment processing charged separately (e.g. Stripe about 2.9% + $0.30, per third-party guide). Some sources note Open Collective Europe has different terms (about 8% administration fee plus card fees). Official pricing page could not be fetched directly. | Not confirmed from a fetched official page. | Fiscal hosting for open-source projects. Projects can receive donations through the host. | https://opencollective.com/opensource/apply/intro (search result) ; https://docs.opencollective.com/oceurope/faq/general-faqs (search result) ; https://docs.opencollective.com/help/fiscal-hosts/become-a-fiscal-host (search result) |
| B2 | Software Freedom Conservancy (member projects) | Fee not found in sources reviewed. | Project must be dedicated to software freedom. Must use an OSI-approved and DFSG-free license (mandatory). Evaluation Committee considers applications on a rolling basis. Conservancy says it is selective and sometimes refers projects elsewhere. Sources differ in tone on speed of acceptance. Full criteria could not be retrieved. | Offers directed donations to specific projects. | https://sfconservancy.org/members/apply/ (search result; not fetched) ; https://sfconservancy.org/static/docs/sponsorship-agreement-template.pdf (search result) |
| B3 | Software in the Public Interest (SPI), US 501(c)(3) | No fee stated in sources found. | Project submits an application; SPI board and contributing members vote. A liaison is usually named (per a 2012 FFmpeg mailing-list thread; details may have changed). | Associated-project agreements formalised by board resolution (e.g. OpenSSL, August 2025). Turnaround described as months in one forum post. Non-US donors can donate via ffis e.V. (Germany). | https://www.spi-inc.org/corporate/resolutions/2025/2025-08-11.jln.1 (search result) ; https://linuxiac.com/gentoo-linux-becomes-an-spi-associated-project-for-fiscal-efficiency/ (search result) ; https://discuss.python.org/t/what-if-a-donor-wants-to-fund-some-new-work/105239 (search result) ; https://lists.ffmpeg.org/pipermail/ffmpeg-devel/2012-May/124323.html (search result) |
| B4 | Linux Foundation-hosted projects (varies by umbrella foundation) | Not stated in sources found. | Each umbrella foundation sets its own process. LF Edge: proposal, Technical Advisory Council presentation and review, then Board vote. LF Networking: Sandbox and Incubation stages. LF Deep Learning Foundation: process documents behind mailing-list sign-up (not verified). | Requires choosing a specific umbrella foundation; no single LF process found. | https://wiki.lfedge.org/x/gIZS (search result) ; https://wiki.lfnetworking.org/x/KoNtBw (search result) ; https://www.linuxfoundation.org/blog/lf-deep-learning-foundation-announces-project-contribution-process (search result) |

**B2 funding (not hosting), listed separately:**

| # | Funder | Stated terms | Sources |
|---|---|---|---|
| B5 | NLnet Foundation (NGI Zero programmes) | Per the NLnet page as reported in a search result: calls paused; new calls expected to open 3 September 2026 with a deadline of 3 November 2026 at 12:00 CEST. Individuals and organisations of any type can apply. Typical range for an earlier call was EUR 5,000 to 50,000 (2023 call summary; check current terms). Open licence release is a requirement. | https://www.nlnet.nl/propose (search result) ; https://nlnet.nl/press/20220601-launchNGIZeroEntrust.html (search result) ; https://lists.fsfe.org/pipermail/discussion/2023-November/013372.html (search result) |

---

## (C) Counsel options for OSS licensing, privacy / data protection, and export control

These are organisations, not individuals. No source was found for export-control–specific pro bono counsel. That area is marked as a gap.

| # | Organisation | Services (as stated) | Cost / eligibility (as stated) | Dates or caveats | Sources |
|---|---|---|---|---|---|
| C1 | Software Freedom Law Center (SFLC, New York) | Pro bono legal services to free and open-source developers. Licensing advice, license defence, trademark counselling, patent defence, nonprofit organisational assistance (per Idealist listing). | Pro bono for FOSS developers and projects. Early reporting said it would not represent commercial vendors. | Sources reviewed are mostly 2005-era. Current status and eligibility not verified. | https://www.softwarefreedom.org/ (not fetched) ; https://www.infoworld.com/article/2218352/osdl-members-fund-open-source-law-center-2.html ; https://en.wikipedia.org/wiki/Software_Freedom_Law_Center |
| C2 | Software Freedom Conservancy | Fiscal sponsorship and non-profit oversight (see B2). Legal help was not confirmed from sources reviewed. | See B2. | Legal services not confirmed. | https://sfconservancy.org/members/apply/ (search result) |
| C3 | Stanford Law School clinic (Juelsgaard clinic, per source) with GitHub Developer Rights Fellowship | Clinic fellowship funded by GitHub to train students and advise on developer rights and open-source advocacy. | Not stated in sources found. | Sources are a 2021 announcement; current status not verified. | https://github.blog/2021-07-27-github-developer-rights-fellowship-stanford-law-school (search result) |
| C4 | Harvard Cyberlaw Clinic (Harvard Law School) | Clinic clients have included academics, researchers, start-ups, non-profits and advocacy groups (per clinic page). | Clinic intake criteria not stated in sources found. | Not specialised in OSS licensing per sources reviewed. | https://clinic.cyber.harvard.edu/clients/ (search result) |
| C5 | Electronic Frontier Foundation, Coders' Rights Project | Legal information for developers on reverse engineering, vulnerability reporting, copyright, patent, trade secret and free speech (2008 announcement). | Not stated. | Program status not confirmed from sources reviewed. | https://www.eff.org/press/archives/2008/08/05-0 (search result) |
| C6 | Open Source Initiative (OSI), license list | Reference list of OSI-approved licences and approval registry; API available for the list. Not a legal service. | Free public reference. | Included because B2 eligibility refers to OSI-approved licences. | https://opensource.org/licenses (search result) |

**Gaps:** No source was found for privacy or data-protection clinics, or export-control counsel offering pro bono or low-cost help. The owner should search for these separately and vet each one.

---

## Source notes

- Pages marked "(search result)" were reported by search snippets only. They were not fetched directly. Some domains (e.g. www.belenios.org, www.verificatum.org in some runs, opencollective.com, sfconservancy.org, nlnet.nl, epfl.ch, freeandfair.us, spi-inc.org) could not be fetched from the research environment.
- The Verificatum GitHub org page, the ElectionGuard repo page, the Helios server repo page, and the Swiss Post GitLab group page were fetched directly.
- Entries are unverified candidates until the owner vets them.
