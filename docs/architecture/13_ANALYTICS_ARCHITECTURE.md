# Analytics Architecture

Layers: OLTP -> domain read models -> governed semantic metrics -> dashboards/reports -> analytical warehouse only when history/load justifies it.

Every KPI has ID, owner, definition, grain, filters, source domains, version/effective date. Dashboard values drill to governed source/read model; no manual numbers embedded in UI.

Heavy historical aggregation must move away before it degrades OLTP.

Cross-domain examples: order/customer/product/channel/location margin, inventory turns/aging, supplier OTIF, yield/OEE, actual-vs-standard work order, project profitability, cash forecast.
