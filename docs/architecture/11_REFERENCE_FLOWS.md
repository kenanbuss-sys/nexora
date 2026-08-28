# Reference End-to-End Flows

1. **Configured B2B manufacturing:** portal -> CPQ -> quote/approval -> OMS -> immutable configuration/BOM -> MRP/reservation -> work order -> scanner/checker -> QC -> finished goods -> fulfillment -> shipment -> invoice/financial event -> BI.
2. **Online fulfilled by branch:** commerce -> OMS -> allocation -> WMS reservation -> mobile pick scan -> pack -> courier -> shipment -> stock movement -> delivery -> finance. Channel never owns separate authoritative inventory.
3. **Imported container:** PO -> supplier confirmation -> ASN/packing list -> inbound/container -> dock -> WMS receipt -> discrepancy/QC -> putaway -> landed cost -> invoice match -> available stock.
4. **Material shortage:** demand -> MRP -> shortage -> planned purchase/transfer -> approval -> inbound -> receipt -> reservation -> work release.
5. **Service/warranty:** serial/customer -> service request -> warranty -> service order -> parts reservation -> repair/field -> QC -> sign-off -> invoice/warranty -> history.
6. **Quality failure:** inspection -> fail -> quarantine -> NCR -> containment -> root cause -> CAPA/rework/scrap -> reinspection -> release.
7. **Machine-assisted production:** scan worker/WO/machine -> authorize start -> gateway cycle/count -> operator/QC verification -> operation complete -> next operation ready.
