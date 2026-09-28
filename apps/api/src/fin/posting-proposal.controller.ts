import { Body, Controller, Inject, Post } from '@nestjs/common';
import type { PostingProposalService } from '@nexora/domain-fin';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const POSTING_PROPOSAL_SERVICE = 'POSTING_PROPOSAL_SERVICE';

const proposeSchema = z.object({
  legalEntityId: z.string().uuid(),
  partnerId: z.string().uuid().optional(),
  text: z.string().max(300).optional(),
  amount: z.number().positive().max(1e12),
});
const draftSchema = z.object({
  legalEntityId: z.string().uuid(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(500),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        debit: z.number().nonnegative(),
        credit: z.number().nonnegative(),
        partnerId: z.string().uuid().optional(),
      }),
    )
    .min(2)
    .max(200),
  proposalHash: z.string().min(8).max(64),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  precedentEntryIds: z.array(z.string().uuid()).max(50),
});

/**
 * FIN-033 (Sprint 233) — precedent-based posting proposals. Proposing is
 * read-only (finance.ledger.read); accepting creates a DRAFT only
 * (finance.ledger.post) — posting remains the separate human step.
 */
@Controller('api/v1/ledger/proposals')
export class PostingProposalController {
  constructor(
    @Inject(POSTING_PROPOSAL_SERVICE) private readonly proposals: PostingProposalService,
  ) {}

  @Post()
  @RequirePermission('finance.ledger.read')
  async propose(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.proposals.propose(parseBody(proposeSchema, body), ctx);
  }

  @Post('draft')
  @RequirePermission('finance.ledger.post')
  async draft(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.proposals.acceptAsDraft(parseBody(draftSchema, body), ctx);
  }
}
