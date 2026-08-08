import { FormalizationState } from '@adoptafacil/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';

/** Feature-local glyphs (same convention as `org-profile-page.tsx`'s
 *  `ExternalLinkIcon`/`PaletteIcon` — no icon library added). */
function MapPinIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3Z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
    </svg>
  );
}

export interface OrgLivePreviewProps {
  /** Live DRAFT values — updates as the user types, before "Guardar" (S2-05
   *  Objetivo #3: "sincronizado con los campos que se están editando"). */
  name: string;
  city: string;
  description: string;
  whatsapp: string;
  logoUrl: string;
  hasInstagram: boolean;
  hasFacebook: boolean;
  hasWebsite: boolean;
  /** Formalization is NOT editable from this screen — this always reflects
   *  the last SAVED state (see `OrgActionBar`'s Formalización pill), never a
   *  local toggle (unlike the mock's `formal` boolean). */
  formalizationState?: FormalizationState;
}

/**
 * Feature-local "how your public profile will look" preview (S2-05 Objetivo
 * #3). NOT a reuse of `features/portals`' `PortalMiniPreview` — that component
 * shows THEME tokens (colors/button variants), lives entirely in Fabián's
 * domain, and the S2-05 decision (see closing report) was to keep the
 * Personalización popover/preview cross-link-only rather than import across
 * the domain boundary. This preview instead mirrors the mock's actual intent:
 * a content preview (name/city/description/contact/social presence) built
 * with the app's shared design tokens, with zero dependency on portal theming.
 */
export function OrgLivePreview({
  name,
  city,
  description,
  whatsapp,
  logoUrl,
  hasInstagram,
  hasFacebook,
  hasWebsite,
  formalizationState,
}: OrgLivePreviewProps) {
  const isFormal = !!formalizationState && formalizationState !== FormalizationState.Informal;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          Así se verá tu organización
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="h-16 bg-primary" aria-hidden />
          <div className="-mt-6 space-y-2 px-4 pb-4">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`Logo de ${name || 'la organización'}`}
                className="h-12 w-12 rounded-lg border-2 border-background object-cover"
              />
            ) : (
              <div
                aria-hidden
                className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-background bg-primary text-lg font-bold text-primary-foreground"
              >
                {name ? name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <p className="text-base font-bold text-foreground">
              {name || 'Nombre de tu organización'}
            </p>
            {city && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPinIcon /> {city}, Colombia
              </p>
            )}
            <p className="text-sm text-foreground">
              {description || 'Tu descripción aparecerá aquí.'}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge variant={isFormal ? 'default' : 'secondary'}>
                {isFormal ? 'Formal' : 'Informal'}
              </Badge>
              {whatsapp && (
                <Badge variant="secondary" className="gap-1">
                  <PhoneIcon /> {whatsapp}
                </Badge>
              )}
            </div>
            {(hasInstagram || hasFacebook || hasWebsite) && (
              <div className="flex gap-2.5 border-t border-border pt-2.5 text-muted-foreground">
                {hasInstagram && <InstagramIcon />}
                {hasFacebook && <FacebookIcon />}
                {hasWebsite && <GlobeIcon />}
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Así verán tu organización los adoptantes.
        </p>
      </CardContent>
    </Card>
  );
}
