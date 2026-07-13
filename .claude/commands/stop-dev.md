Stop the GrimoireOS dev servers using `./stop.sh` in the project root.

The script kills every `dev.sh` process group it finds (backend, frontend, and any orphans left behind by previous Claude background shells), then sweeps anything still bound to ports 3000/3001. PostgreSQL is left running.

**Cache reset (opt-in):** if the user passes `clean` / `reset` / `reset-cache` as an argument (`$ARGUMENTS`), or asks to also clear the build cache, run `./stop.sh --clean` instead — this additionally deletes `frontend/.next` (the Turbopack build cache). Reach for this when next-server has run away with CPU at idle: the persistent dev cache can bloat over a long session and wedge the file watcher into a CPU spin, and clearing it resets that. Otherwise run plain `./stop.sh` — the cache is what keeps warm restarts fast, so `--clean` forces a cold recompile of every route on the next `./dev.sh` and shouldn't be the default.

Run the appropriate form and report which trees were stopped (and, if `--clean` was used, that the build cache was cleared).
