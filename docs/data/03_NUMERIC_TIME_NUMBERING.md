# Numeric, Time & Numbering Rules

Money: arbitrary/DB decimal, explicit ISO currency, rounding policy by document/context. Never binary floating point.

Quantity: decimal with UOM and conversion version; avoid silent unit conversion.

Percent/rate: decimal with explicit scale semantics.

Time: instants UTC; site/tenant timezone for presentation/scheduling; local business date explicitly modeled when required. Recurring schedules preserve timezone semantics.

Document numbers: configurable sequences by tenant/legal entity/document type/year/site as required. Internal immutable IDs are separate from human/legal numbers. Issued numbers are not reused after void unless local law/policy explicitly requires otherwise.
