import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { ContractService } from '@nexora/domain-doc';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const CONTRACT_SERVICE = 'CONTRACT_SERVICE';

const createContractSchema = z.object({
  title: z.string().min(1).max(300),
  partyId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  renewalNoticeDays: z.number().int().min(0).max(365).optional(),
  value: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
});
const contractTransitionSchema = z.object({ status: z.enum(['ACTIVE', 'TERMINATED']) });

@Controller('api/v1/contracts')
export class ContractsController {
  constructor(@Inject(CONTRACT_SERVICE) private readonly contracts: ContractService) {}

  @Get()
  @RequirePermission('document.read')
  async list(@Ctx() ctx: RequestContext) {
    return { contracts: await this.contracts.listContracts(ctx) };
  }

  @Get('renewals')
  @RequirePermission('document.read')
  async renewals(@Ctx() ctx: RequestContext) {
    return { renewals: await this.contracts.renewalsDue(ctx) };
  }

  @Post()
  @RequirePermission('document.issue')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.contracts.createContract(parseBody(createContractSchema, body), ctx);
  }

  @Post(':id/transition')
  @RequirePermission('document.issue')
  async transition(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(contractTransitionSchema, body);
    return this.contracts.transition(id, input.status, ctx);
  }
}
