from pathlib import Path
import json,csv,sys
r=Path(__file__).resolve().parents[1]
required=["CLAUDE.md","START_CLAUDE_CODE.md","docs/00_SOURCE_OF_TRUTH.md","docs/02_MASTER_CAPABILITY_CATALOG.md","specs/capabilities.json","specs/events.json","specs/state_machines.json","specs/domain_ownership.csv","docs/architecture/01_DOMAIN_MAP.md","docs/security/01_SECURITY_BASELINE.md","docs/implementation/ROADMAP.md"]
missing=[x for x in required if not (r/x).exists()]
if missing:
 print("Missing:",missing); sys.exit(1)
c=json.loads((r/"specs/capabilities.json").read_text())['capabilities']
if len({x['id'] for x in c})!=len(c): print("duplicate capability"); sys.exit(1)
e=json.loads((r/"specs/events.json").read_text())['events']
if len({x['name'] for x in e})!=len(e): print("duplicate event"); sys.exit(1)
print(f"OK: {len(c)} capabilities, {len(e)} events")
