import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../lib/utils';
import { XIcon } from './icons';
import styles from './drawer.module.scss';

/**
 * Right-anchored sliding panel, for "view detail without leaving the list"
 * flows (e.g. the adoptions kanban's applicant detail). Same Radix Dialog
 * primitives as `Dialog` (focus trap, `Esc`, `aria-modal`) — only the
 * positioning/animation differ. Compose exactly like `Dialog`:
 *
 *   <Drawer>
 *     <DrawerTrigger asChild><Button>Ver detalle</Button></DrawerTrigger>
 *     <DrawerContent>
 *       <DrawerHeader><DrawerTitle>…</DrawerTitle></DrawerHeader>
 *       <DrawerBody>…</DrawerBody>
 *       <DrawerFooter>…</DrawerFooter>
 *     </DrawerContent>
 *   </Drawer>
 */
export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerPortal = DialogPrimitive.Portal;
export const DrawerClose = DialogPrimitive.Close;

export const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(styles['drawer-overlay'], className)}
    {...props}
  />
));
DrawerOverlay.displayName = DialogPrimitive.Overlay.displayName;

export interface DrawerContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  hideCloseButton?: boolean;
}

export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, children, hideCloseButton = false, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(styles['drawer-content'], className)}
      {...props}
    >
      {children}
      {hideCloseButton ? null : (
        <DialogPrimitive.Close className={styles['drawer-close']}>
          <XIcon />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = DialogPrimitive.Content.displayName;

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles['drawer-header'], className)} {...props} />;
}
DrawerHeader.displayName = 'DrawerHeader';

export function DrawerBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles['drawer-body'], className)} {...props} />;
}
DrawerBody.displayName = 'DrawerBody';

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles['drawer-footer'], className)} {...props} />;
}
DrawerFooter.displayName = 'DrawerFooter';

export const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn(styles['drawer-title'], className)} {...props} />
));
DrawerTitle.displayName = DialogPrimitive.Title.displayName;

export const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(styles['drawer-description'], className)}
    {...props}
  />
));
DrawerDescription.displayName = DialogPrimitive.Description.displayName;
