# AI Architecture & Governance

Business domains do not call model providers directly. AI Gateway owns provider selection, model policy, prompt/version registry, structured outputs, usage/cost, redaction, evaluation and provenance.

Risk classes: read-only explanation, recommendation, draft, prepared action, autonomous low-risk action.

Payments, stock adjustments, credit, controlled production/quality release, destructive admin and legally significant actions require domain authorization and normally human approval.

AI analytics uses governed metrics. Knowledge assistant uses approved documents/SOPs. External/customer/supplier content is untrusted and cannot redefine instructions or permissions. Maintain eval sets before production enablement.
