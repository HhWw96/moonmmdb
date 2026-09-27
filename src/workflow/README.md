# MoonMMDB workflow

Optional MoonBit policy package for portable local tasks and report verification.

`check_task(Json)` validates version 1 role-based tasks. `check_report(Json)` checks internal report consistency and returns the normalized task and result. `report_compare(String, String)` compares validated semantic results and source hashes. The string bridge functions return structured errors; the typed functions raise `WorkflowError`.

This module does not open paths, upload files or execute commands. Hosts must bind roles explicitly, enforce transport limits, verify hashes and rerun the operation before claiming recomputed agreement. Internal consistency alone is not independent correctness proof. Resource boundaries and schemas are documented in ../../docs/WORKFLOWS.md. Existing APIs and prior compatibility baselines remain unchanged.
