import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import type { DeviceService, PrintService, ScaleService } from '@nexora/domain-dev';
import type { CollaborationService } from '@nexora/domain-collab';
import type { ShopFloorService } from '@nexora/domain-mes';
import { COLLAB_SERVICE } from '../collab/collab.controller';
import { SHOPFLOOR_SERVICE } from '../mes/shopfloor.controller';
import type { VerificationService } from '@nexora/domain-ver';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Public } from '../auth/auth.guard';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const DEVICE_SERVICE = 'DEVICE_SERVICE';
export const PRINT_SERVICE = 'PRINT_SERVICE';
export const SCALE_SERVICE = 'SCALE_SERVICE';
export const VERIFICATION_SERVICE = 'VERIFICATION_SERVICE';

const registerSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  deviceType: z.enum(['SCANNER', 'TABLET', 'PRINTER', 'SCALE', 'OTHER']),
});
const enrollSchema = z.object({
  enrollmentToken: z.string().min(16).max(128),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  appVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional(),
});
const heartbeatSchema = z.object({ enrollmentToken: z.string().min(16).max(128) });
const assignSchema = z.object({
  userId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
});
const revokeSchema = z.object({ reason: z.string().min(1).max(500) });

const envelopeSchema = z.object({
  enrollmentToken: z.string().min(16).max(128),
  events: z
    .array(
      z.object({
        clientEventId: z.string().min(8).max(128),
        kind: z.enum(['BARCODE', 'QR', 'RFID', 'NFC']),
        value: z.string().min(1).max(500),
        capturedAt: z.string().datetime(),
        context: z.record(z.string(), z.unknown()).optional(),
        correlationId: z.string().max(100).optional(),
      }),
    )
    .min(1)
    .max(500),
});

const materialCheckSchema = z.object({
  expectedSkuId: z.string().uuid(),
  barcode: z.string().min(1).max(128),
  expectedQty: z.number().positive().optional(),
  countedQty: z.number().nonnegative().optional(),
});

@Controller('api/v1/devices')
export class DevicesController {
  constructor(@Inject(DEVICE_SERVICE) private readonly devices: DeviceService) {}

  @Get()
  @RequirePermission('device.read')
  async list(@Ctx() ctx: RequestContext) {
    return { devices: await this.devices.listDevices(ctx) };
  }

  @Post()
  @RequirePermission('device.enroll')
  async register(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.devices.registerDevice(parseBody(registerSchema, body), ctx);
  }

  /** Device-side: claim identity with the one-time token. No user session. */
  /** DEV-011 — fleet view: app versions vs the configured minimum. */
  @Get('fleet')
  @RequirePermission('device.read')
  async fleet(@Ctx() ctx: RequestContext) {
    return this.devices.fleetVersions(ctx);
  }

  /** DEV-005 — scanner/device capability configuration. */
  @Post(':id/capabilities')
  @RequirePermission('device.assign')
  async setCapabilities(
    @Param('id') id: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(z.object({ capabilities: z.record(z.string(), z.unknown()) }), body);
    return this.devices.setCapabilities(id, input.capabilities, ctx);
  }

  /** DEV-015 — one chronological event trail per device. */
  @Get(':id/events')
  @RequirePermission('device.read')
  async deviceEvents(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { events: await this.devices.deviceEventAudit(id, ctx) };
  }

  @Post('enroll')
  @Public()
  async enroll(@Body() body: unknown) {
    const input = parseBody(enrollSchema, body);
    return this.devices.enrollDevice(input.enrollmentToken, {
      ...(input.capabilities ?? {}),
      ...(input.appVersion !== undefined ? { appVersion: input.appVersion } : {}),
    });
  }

  /** Device-side liveness ping (DEV-004). */
  @Post('heartbeat')
  @Public()
  async heartbeat(@Body() body: unknown) {
    return this.devices.heartbeat(parseBody(heartbeatSchema, body).enrollmentToken);
  }

  @Post(':id/assign')
  @RequirePermission('device.assign')
  async assign(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(assignSchema, body);
    return this.devices.assignDevice({ deviceId: id, ...input }, ctx);
  }

  @Post(':id/revoke')
  @RequirePermission('device.revoke')
  async revoke(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.devices.revokeDevice(id, parseBody(revokeSchema, body).reason, ctx);
  }
}

@Controller('api/v1/scan-events')
export class ScanEventsController {
  constructor(@Inject(VERIFICATION_SERVICE) private readonly verification: VerificationService) {}

  /**
   * Device-side envelope upload (VER-017 offline queue). Authenticated by
   * enrollment token, idempotent per clientEventId (VER-018).
   */
  @Post()
  @Public()
  async record(@Body() body: unknown) {
    const input = parseBody(envelopeSchema, body);
    return this.verification.recordEnvelope(input.enrollmentToken, input.events);
  }

  /** Scan-first material check (VER-007/011). */
  @Post('material-check')
  @RequirePermission('inventory.read')
  async materialCheck(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(materialCheckSchema, body);
    return this.verification.materialCheck(input, ctx);
  }

  /** Worker check (VER-005). */
  @Post('worker-check')
  @RequirePermission('inventory.read')
  async workerCheck(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ idpSubject: z.string().min(1).max(200) }), body);
    return this.verification.workerCheck(input, ctx);
  }

  /** Work-order check (VER-006). */
  @Post('work-order-check')
  @RequirePermission('production.read')
  async workOrderCheck(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        woNumber: z.string().min(1).max(60),
        expectedStatus: z.string().max(30).optional(),
      }),
      body,
    );
    return this.verification.workOrderCheck(input, ctx);
  }

  /** Location check (VER-010). */
  @Post('location-check')
  @RequirePermission('inventory.read')
  async locationCheck(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({ warehouseId: z.string().uuid(), code: z.string().min(1).max(60) }),
      body,
    );
    return this.verification.locationCheck(input, ctx);
  }

  /** Machine check (VER-008). */
  @Post('machine-check')
  @RequirePermission('production.read')
  async machineCheck(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({ code: z.string().min(1).max(60), operationId: z.string().uuid().optional() }),
      body,
    );
    return this.verification.machineCheck(input, ctx);
  }

  /** Tool check (VER-009). */
  @Post('tool-check')
  @RequirePermission('production.read')
  async toolCheck(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({ code: z.string().min(1).max(60), operation: z.string().max(100).optional() }),
      body,
    );
    return this.verification.toolCheck(input, ctx);
  }

  /** Photo evidence link (VER-015). */
  @Post(':id/evidence')
  @RequirePermission('collab.use')
  async linkEvidence(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ attachmentId: z.string().uuid() }), body);
    return this.verification.linkEvidence({ scanEventId: id, ...input }, ctx);
  }

  /** Digital signature (VER-016). */
  @Post('signatures')
  @RequirePermission('production.execute')
  async recordSignature(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        objectType: z.string().min(2).max(40),
        objectId: z.string().min(1).max(80),
        signerName: z.string().min(2).max(120),
        pin: z.string().min(4).max(12),
      }),
      body,
    );
    return this.verification.recordSignature(input, ctx);
  }

  @Post('signatures/verify')
  @RequirePermission('production.read')
  async verifySignature(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        objectType: z.string().min(2).max(40),
        objectId: z.string().min(1).max(80),
        signerName: z.string().min(2).max(120),
        pin: z.string().min(4).max(12),
      }),
      body,
    );
    return this.verification.verifySignature(input, ctx);
  }

  /** RFID check (VER-003). */
  @Post('rfid-check')
  @RequirePermission('inventory.read')
  async rfidCheck(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ tag: z.string().min(4).max(64) }), body);
    return this.verification.rfidCheck(input, ctx);
  }

  /** NFC check (VER-004). */
  @Post('nfc-check')
  @RequirePermission('inventory.read')
  async nfcCheck(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ badge: z.string().min(4).max(64) }), body);
    return this.verification.nfcCheck(input, ctx);
  }

  /** Sequence check (VER-012). */
  @Post('sequence-check')
  @RequirePermission('production.read')
  async sequenceCheck(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({ workOrderId: z.string().uuid(), operationId: z.string().uuid() }),
      body,
    );
    return this.verification.sequenceCheck(input, ctx);
  }

  @Get()
  @RequirePermission('verification.audit')
  async list(@Ctx() ctx: RequestContext) {
    return { events: await this.verification.listEvents({}, ctx) };
  }
}

/** Printer job queue (DEV-006) — device-facing, enrollment-token auth. */
@Controller('api/v1/devices/print-jobs')
export class PrintJobsController {
  constructor(
    @Inject(PRINT_SERVICE) private readonly printing: PrintService,
    @Inject(DEVICE_SERVICE) private readonly devices: DeviceService,
  ) {}

  private async deviceOf(enrollmentToken: string) {
    const resolved = await this.devices.resolveByToken(enrollmentToken);
    if (!resolved || !resolved.active) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown device token' });
    }
    return resolved;
  }

  @Get()
  @Public()
  async pending(@Query('enrollmentToken') enrollmentToken: string) {
    const device = await this.deviceOf(enrollmentToken ?? '');
    return { jobs: await this.printing.pendingJobs(device.tenantId, device.deviceId) };
  }

  @Post('ack')
  @Public()
  async ack(@Body() body: unknown) {
    const input = parseBody(
      z.object({ enrollmentToken: z.string().min(8), jobKey: z.string().min(1).max(80) }),
      body,
    );
    const device = await this.deviceOf(input.enrollmentToken);
    return this.printing.ackJob(device.tenantId, device.deviceId, input.jobKey);
  }
}

/** Scale weight capture (DEV-008) — device-facing, enrollment-token auth. */
@Controller('api/v1/devices/weights')
export class WeightsController {
  constructor(
    @Inject(SCALE_SERVICE) private readonly scales: ScaleService,
    @Inject(DEVICE_SERVICE) private readonly devices: DeviceService,
  ) {}

  @Post()
  @Public()
  async capture(@Body() body: unknown) {
    const input = parseBody(
      z.object({
        enrollmentToken: z.string().min(8),
        packageNumber: z.string().min(3).max(40),
        weightKg: z.number().positive(),
        captureId: z.string().min(1).max(64),
      }),
      body,
    );
    const device = await this.devices.resolveByToken(input.enrollmentToken);
    if (!device || !device.active) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown device token' });
    }
    return this.scales.captureWeight({
      tenantId: device.tenantId,
      deviceId: device.deviceId,
      packageNumber: input.packageNumber,
      weightKg: input.weightKg,
      captureId: input.captureId,
    });
  }
}

/**
 * Machine gateway (DEV-013/014): edge gateways authenticate as
 * registered devices and push machine events; the shop-floor domain
 * owns the effects (counters, auto-downtime) through its public
 * interface.
 */
@Controller('api/v1/devices/machine-events')
export class MachineGatewayController {
  constructor(
    @Inject(DEVICE_SERVICE) private readonly devices: DeviceService,
    @Inject(SHOPFLOOR_SERVICE) private readonly shopFloor: ShopFloorService,
  ) {}

  @Post()
  @Public()
  async ingest(@Body() body: unknown) {
    const input = parseBody(
      z.object({
        enrollmentToken: z.string().min(8),
        workCenterCode: z.string().min(1).max(60),
        eventId: z.string().min(1).max(64),
        eventType: z.enum(['COUNT', 'DOWN', 'UP']),
        value: z.number().optional(),
      }),
      body,
    );
    const device = await this.devices.resolveByToken(input.enrollmentToken);
    if (!device || !device.active) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown device token' });
    }
    return this.shopFloor.recordMachineEvent(
      {
        workCenterCode: input.workCenterCode,
        eventId: `gw:${device.deviceId}:${input.eventId}`,
        eventType: input.eventType,
        ...(input.value !== undefined ? { value: input.value } : {}),
      },
      {
        tenantId: device.tenantId,
        tenantSlug: '',
        tenantStatus: 'ACTIVE',
        actorType: 'SERVICE',
        userId: undefined,
        userStatus: undefined,
        platformAdmin: false,
      },
    );
  }
}

/**
 * Camera/evidence capture (DEV-009): devices upload photo evidence
 * for a scan event with their enrollment token; the attachment goes
 * through the document domain and links into the verification trail.
 */
@Controller('api/v1/devices/evidence')
export class DeviceEvidenceController {
  constructor(
    @Inject(DEVICE_SERVICE) private readonly devices: DeviceService,
    @Inject(COLLAB_SERVICE) private readonly collab: CollaborationService,
    @Inject(VERIFICATION_SERVICE) private readonly verification: VerificationService,
  ) {}

  @Post()
  @Public()
  async upload(@Body() body: unknown) {
    const input = parseBody(
      z.object({
        enrollmentToken: z.string().min(8),
        scanEventId: z.string().uuid(),
        fileName: z.string().min(1).max(200),
        contentType: z.string().min(3).max(100),
        dataBase64: z.string().min(1),
      }),
      body,
    );
    const device = await this.devices.resolveByToken(input.enrollmentToken);
    if (!device || !device.active) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown device token' });
    }
    const serviceCtx = {
      tenantId: device.tenantId,
      tenantSlug: '',
      tenantStatus: 'ACTIVE' as const,
      actorType: 'SERVICE' as const,
      userId: undefined,
      userStatus: undefined,
      platformAdmin: false,
    };
    const attachment = await this.collab.uploadAttachment(
      {
        entityType: 'work_order',
        entityId: input.scanEventId,
        fileName: input.fileName,
        contentType: input.contentType,
        dataBase64: input.dataBase64,
      },
      serviceCtx,
    );
    await this.verification.linkEvidence(
      { scanEventId: input.scanEventId, attachmentId: attachment.id },
      serviceCtx,
    );
    return { attachmentId: attachment.id, ok: true };
  }
}
