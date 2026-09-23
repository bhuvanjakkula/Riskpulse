# Local commands

This is a new compatible implementation of the command examples from yesterday. The original /home/workdir/scientific_operator source was not available on this Windows computer; its unspecified behavior cannot be reproduced or certified.

From the NULLMESH v0 folder:

    python -m scientific_operator.cli rules
    python -m scientific_operator.cli size --equity 100000 --entry 50 --stop 48
    python -m scientific_operator.cli recover --loss-pct 20
    python -m scientific_operator.cli decide --equity 100000 --entry 50 --stop 48 --stock-rs 0.08 --group-rs 0.05
    python -m scientific_operator.cli decide --regime unstable --stock-rs -0.04 --group-rs -0.07 --tip
    python -m scientific_operator.cli demo
    python -m scientific_operator.cli snapshot
    python -m scientific_operator.cli checklist
    python -m unittest discover -s scientific_operator/tests -v

All eight commands were executed successfully. The policy is illustrative and configurable with --risk-pct, default 1%. Snapshot reports policy and connection limitations; it is not a live market snapshot. No trading is performed.
