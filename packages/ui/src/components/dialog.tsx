import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../lib/utils';
import { XIcon } from './icons';
import styles from './dialog.module.scss';

/**
 * Modal dialog on Radix primitives: focus trap, `Esc` to close, scroll lock and
 * `aria-modal` come for free. BEM+SCSS (REFACTOR-VISUAL v2). Compose:
 *
 *   <Dialog>
 *     <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
 *     <DialogContent>
 *       <DialogHeader>
 *         <DialogTitle>Title</DialogTitle>
 *         <DialogDescription>…</DialogDescription>
 *       </DialogHeader>
 *       …
 *       <DialogFooter>…</DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(styles['dialog-overlay'], className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /** Hide the built-in top-right close button (default shown). */
  hideCloseButton?: boolean;
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, hideCloseButton = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(styles['dialog-content'], className)}
      {...props}
    >
      {children}
      {hideCloseButton ? null : (
        <DialogPrimitive.Close className={styles['dialog-close']}>
          <XIcon />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles['dialog-header'], className)} {...props} />;
}
DialogHeader.displayName = 'DialogHeader';

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles['dialog-footer'], className)} {...props} />;
}
DialogFooter.displayName = 'DialogFooter';

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn(styles['dialog-title'], className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(styles['dialog-description'], className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
