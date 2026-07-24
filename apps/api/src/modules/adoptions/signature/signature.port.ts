/**
 * DI token for the SignaturePort (hexagonal). LOCAL to the adoptions module — NOT
 * in core/ — because electronic signature is specific to M04 in Ola 1. Same style
 * as core's NotificationPort: a Symbol token bound in the module to a simulable
 * adapter; real providers (Ley 527/1999) arrive behind the SAME interface, swapped
 * in one place. The interface shape is published in `@adoptafacil/contracts`.
 */
export const SIGNATURE_PORT = Symbol('SIGNATURE_PORT');

export type {
  SignaturePort,
  AdoptionSignatureRequest,
  AdoptionSignatureResult,
} from '@adoptafacil/contracts';
