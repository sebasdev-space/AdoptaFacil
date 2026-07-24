import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type {
  AdoptionSignatureRequest,
  AdoptionSignatureResult,
  SignaturePort,
} from '@adoptafacil/contracts';

/**
 * Simulable SignaturePort adapter (local-dev, Ola 1). Emits a DETERMINISTIC fake
 * electronic signature (Ley 527/1999) derived from the contract, signer and the
 * document hash, instead of contacting a real provider. No PII is logged. Swap the
 * binding in `adoptions.module.ts` for a real adapter in production.
 */
@Injectable()
export class FakeSignatureAdapter implements SignaturePort {
  private readonly logger = new Logger('SignaturePort');
  static readonly PROVIDER = 'fake-local';

  async sign(request: AdoptionSignatureRequest): Promise<AdoptionSignatureResult> {
    const signatureId = createHash('sha256')
      .update(`${request.contractId}:${request.signerId}:${request.documentHash}`, 'utf8')
      .digest('hex')
      .slice(0, 40);
    this.logger.log(
      `[SIMULATED] signed contract=${request.contractId} signer=${request.signerId} role=${request.signerRole}`,
    );
    return {
      signatureId: `fake:${signatureId}`,
      signedAt: new Date().toISOString(),
      provider: FakeSignatureAdapter.PROVIDER,
    };
  }
}
