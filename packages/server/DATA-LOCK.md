# Server data-directory ownership

`buildServer()` acquires an exclusive `.qv-server.lock` directory before opening the control database or loading the KEK. Paths are canonicalized, so aliases through directory symlinks share the same lock. A second instance fails at startup rather than maintaining a second election-admission projection over the same SQLite files.

The lock remains held through the server shutdown sequence, including the job runner, HTTP listener, election pool and control database. Existing shutdown timeouts and force-close behavior remain unchanged; this lock is not a new guarantee that arbitrary in-flight callbacks have quiesced. Call `await server.stop()` even if the server was built without being started. Construction and listen failures release the lock after cleanup. A stopped instance cannot be restarted; build a new instance.

A process crash, forced termination or host failure can leave the empty lock directory behind. Startup deliberately refuses to infer that a lock is stale from a PID or timestamp. Before removing `.qv-server.lock`, stop every QuietVote process and container that can access the volume, including processes on other hosts. Verify that the configured directory is the intended data volume, remove only the empty lock directory, and restart one instance. Never remove a live instance's lock.

The data directory must be writable only by its operator. The lock prevents accidental concurrent server instances; it does not isolate arbitrary SQLite tools or protect a directory controlled by a hostile local user. Use a local or otherwise supported filesystem with atomic directory creation; multi-host network-filesystem locking has not been qualified.

Tests cover competing instances in one process and separate processes, path aliases, construction/listen failure, idempotent shutdown and fail-closed leftover-lock handling. The lock does not change election records or protocol bytes.
