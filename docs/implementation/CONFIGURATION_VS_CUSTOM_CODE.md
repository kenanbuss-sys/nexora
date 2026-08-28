# Configuration vs Custom Code Decision

Use this order:
1. existing module configuration
2. custom field/object/form
3. workflow/rule/approval
4. document/dashboard/template
5. connector/device adapter
6. reusable industry pack
7. reusable core capability
8. isolated custom extension

Never edit generic core with `if tenant == X` logic.

A new reusable core capability requires product review, capability ID, domain ownership, spec, security impact, events/state changes, migration and tests.
