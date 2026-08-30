import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { DeviceService } from '@nexora/domain-dev';
import type { VerificationService } from '@nexora/domain-ver';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Public } from '../auth/auth.guard';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const DEVICE_SERVICE = 'DEVICE_SERVICE';
export const VERIFICATION_SERVICE = 'VERIFICATION_SERVICE';

const registerSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  deviceType: z.enum(['SCANNER', 'TABLET', 'PRINTER', 'SCALE', 'OTHER']),
});
const enrollSchema = z.object({
  enrollmentToken: z.string().min(16).max(128),
  capabilities: z.record(z.string(), z.unknown()).optional(),
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
  @Post('enroll')
  @Public()
  async enroll(@Body() body: unknown) {
    const input = parseBody(enrollSchema, body);
    return this.devices.enrollDevice(input.enrollmentToken, input.capabilities);
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

  @Get()
  @RequirePermission('verification.audit')
  async list(@Ctx() ctx: RequestContext) {
    return { events: await this.verification.listEvents({}, ctx) };
  }
}
