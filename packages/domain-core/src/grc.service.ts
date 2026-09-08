import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { CustomObjectService } from './customobject.service';

/**
 * GRC (GRC-001..009) as governed data, not new tables: one setup call
 * provisions the tenant's risk register, policy library, control
 * catalogue, incident log, near-miss log, PPE requirements and safety
 * checklists as governed custom objects (validated fields, audited
 * records), and the overview reads them back. Compliance tasks ride
 * the ordinary task engine; internal audits are records with owners
 * and due dates.
 */

const GRC_OBJECTS: Array<{ key: string; name: string; fields: unknown }> = [
  {
    key: 'grc_policy',
    name: 'Politika',
    fields: [
      { key: 'naziv', label: 'Naziv', type: 'text', required: true },
      { key: 'vlasnik', label: 'Vlasnik', type: 'text', required: true },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: ['nacrt', 'aktivna', 'povucena'],
      },
      { key: 'vrijedi_od', label: 'Vrijedi od', type: 'date', required: false },
    ],
  },
  {
    key: 'grc_risk',
    name: 'Rizik',
    fields: [
      { key: 'naziv', label: 'Naziv', type: 'text', required: true },
      {
        key: 'vjerovatnoca',
        label: 'Vjerovatnoća',
        type: 'select',
        required: true,
        options: ['niska', 'srednja', 'visoka'],
      },
      {
        key: 'uticaj',
        label: 'Uticaj',
        type: 'select',
        required: true,
        options: ['nizak', 'srednji', 'visok'],
      },
      { key: 'mitigacija', label: 'Mitigacija', type: 'text', required: false },
    ],
  },
  {
    key: 'grc_control',
    name: 'Kontrola',
    fields: [
      { key: 'naziv', label: 'Naziv', type: 'text', required: true },
      { key: 'rizik', label: 'Vezani rizik', type: 'text', required: false },
      {
        key: 'ucestalost',
        label: 'Učestalost',
        type: 'select',
        required: true,
        options: ['dnevno', 'sedmicno', 'mjesecno', 'kvartalno'],
      },
    ],
  },
  {
    key: 'grc_internal_audit',
    name: 'Interna revizija',
    fields: [
      { key: 'tema', label: 'Tema', type: 'text', required: true },
      { key: 'revizor', label: 'Revizor', type: 'text', required: true },
      { key: 'rok', label: 'Rok', type: 'date', required: true },
      { key: 'nalaz', label: 'Nalaz', type: 'text', required: false },
    ],
  },
  {
    key: 'grc_incident',
    name: 'Incident',
    fields: [
      { key: 'naslov', label: 'Naslov', type: 'text', required: true },
      {
        key: 'ozbiljnost',
        label: 'Ozbiljnost',
        type: 'select',
        required: true,
        options: ['niska', 'srednja', 'visoka', 'kriticna'],
      },
      { key: 'opis', label: 'Opis', type: 'text', required: true },
    ],
  },
  {
    key: 'grc_near_miss',
    name: 'Skoro-incident',
    fields: [
      { key: 'naslov', label: 'Naslov', type: 'text', required: true },
      { key: 'lokacija', label: 'Lokacija', type: 'text', required: false },
    ],
  },
  {
    key: 'grc_ppe',
    name: 'ZZO zahtjev',
    fields: [
      { key: 'radno_mjesto', label: 'Radno mjesto', type: 'text', required: true },
      { key: 'oprema', label: 'Obavezna oprema', type: 'text', required: true },
    ],
  },
  {
    key: 'grc_safety_checklist',
    name: 'Sigurnosna lista',
    fields: [
      { key: 'naziv', label: 'Naziv', type: 'text', required: true },
      { key: 'stavke', label: 'Stavke (odvojene sa ;)', type: 'text', required: true },
    ],
  },
];

export class GrcService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly objects: CustomObjectService,
  ) {}

  /** Provision the GRC registers once; re-running reports what exists. */
  async setup(ctx: RequestContext): Promise<{ created: string[]; existing: string[] }> {
    const created: string[] = [];
    const existing: string[] = [];
    for (const object of GRC_OBJECTS) {
      try {
        await this.objects.defineObject(object, ctx);
        created.push(object.key);
      } catch (error) {
        if ((error as { code?: string }).code === 'CONFLICT') {
          existing.push(object.key);
        } else {
          throw error;
        }
      }
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'grc.setup',
      objectType: 'Grc',
      objectId: 'registers',
      source: 'api',
      newValues: { created, existing },
    });
    return { created, existing };
  }

  /** The compliance overview: register sizes and high-severity flags. */
  async overview(ctx: RequestContext): Promise<{
    registers: Array<{ key: string; name: string; records: number }>;
    highRisks: number;
    criticalIncidents: number;
  }> {
    const definitions = await this.prisma.customObjectDefinition.findMany({
      where: { tenantId: ctx.tenantId, key: { startsWith: 'grc_' } },
      select: { id: true, key: true, name: true },
    });
    if (definitions.length === 0) {
      throw new DomainError('INVALID_STATE', 'GRC registers are not provisioned — run setup');
    }
    const counts = await this.prisma.customObjectRecord.groupBy({
      by: ['definitionId'],
      where: { tenantId: ctx.tenantId, definitionId: { in: definitions.map((d) => d.id) } },
      _count: { _all: true },
    });
    const countOf = new Map(counts.map((c) => [c.definitionId, c._count._all]));
    const riskDef = definitions.find((d) => d.key === 'grc_risk');
    const incidentDef = definitions.find((d) => d.key === 'grc_incident');
    const [risks, incidents] = await Promise.all([
      riskDef
        ? this.prisma.customObjectRecord.findMany({
            where: { tenantId: ctx.tenantId, definitionId: riskDef.id },
            select: { data: true },
            take: 1000,
          })
        : Promise.resolve([]),
      incidentDef
        ? this.prisma.customObjectRecord.findMany({
            where: { tenantId: ctx.tenantId, definitionId: incidentDef.id },
            select: { data: true },
            take: 1000,
          })
        : Promise.resolve([]),
    ]);
    const highRisks = risks.filter(
      (r) => ((r.data as { vjerovatnoca?: string }).vjerovatnoca ?? '') === 'visoka',
    ).length;
    const criticalIncidents = incidents.filter(
      (r) => ((r.data as { ozbiljnost?: string }).ozbiljnost ?? '') === 'kriticna',
    ).length;
    return {
      registers: definitions.map((d) => ({
        key: d.key,
        name: d.name,
        records: countOf.get(d.id) ?? 0,
      })),
      highRisks,
      criticalIncidents,
    };
  }
}
