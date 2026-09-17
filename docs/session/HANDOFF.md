# HANDOFF — 17.09.2026 (Sprint 220)

Stanje: Sprint 220 završen na `docs/software-factory-md-v1`. CRM (leadovi/kupci/prilike, 360° s linkovima) i Ponude/CPQ (DataTable, statusi, stavke s iznosima ISKLJUČIVO sa servera) na standardu 215–219; ConfirmDialog za konverziju leada, kreditni profil, slanje/prihvatanje/odbijanje ponude i konverziju u narudžbu (skladište + fakti; ponovna konverzija 409). Kupci nad postojećim partnerima; konfigurator u postojećem obimu. Backend netaknut.

Provjere: kompletan tok kroz browser — ponuda 2×120=240 EUR (cjenovnik) → prihvaćena → SO-000009 240 EUR (stavke prenesene tačno); ponovna konverzija 409 bez duplikata; accept nacrta odbijen (INVALID_STATE); zabranjen pristup; tenant izolacija; mobilno; typecheck/build ✓; lint 0 errors.

Otvoreno: vizuelni pregled 215–220, LaunchAgent, FIN-028, HR inventar, stvarni adapteri, preostale EN stranice.
