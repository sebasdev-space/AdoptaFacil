// Shared payment UI (T-OrdersAPI) — the MercadoPago Card Payment Brick, used
// by BOTH donations (`DonateForm`) and sponsorships (`MySponsorshipsList`'s
// "Pagar de nuevo"). Not a full "module" like donations/sponsorships — just a
// small shared surface so neither feature duplicates the SDK wiring.
export {
  CardPaymentBrick,
  type CardPaymentBrickProps,
  type CardPaymentBrickResult,
} from './components/card-payment-brick';
