Stop the GrimoireOS dev servers using `./stop.sh` in the project root.

The script kills every `dev.sh` process group it finds (backend, frontend, and any orphans left behind by previous Claude background shells), then sweeps anything still bound to ports 3000/3001. PostgreSQL is left running.

Run `./stop.sh` and report which trees were stopped.
