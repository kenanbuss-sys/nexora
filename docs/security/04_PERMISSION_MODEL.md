# Permission Model

Permission key format: `<domain>.<resource/action>` or established domain-specific key. Default deny.

Authorization context may combine: role permission, legal entity, business unit, branch/factory, warehouse, department, project, record ownership/team, field sensitivity and action amount/approval authority.

Evaluation order: authenticated identity -> tenant -> account active -> capability/module enabled -> permission -> scope -> record/field policy -> business invariant.

Approval authority is separate from basic edit permission. A user may create but not approve their own high-value transaction when SoD policy forbids it.

Backend returns authorization reason codes usable by UI without exposing sensitive policy details. Permission changes invalidate relevant caches/sessions according to policy.
