import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../lib/utils';
import styles from './tabs.module.scss';

/**
 * Tabbed navigation on Radix primitives: roving focus, arrow-key navigation and
 * the `tablist`/`tab`/`tabpanel` roles are handled for you. Pill-segmented
 * style (REFACTOR-VISUAL v2, BEM+SCSS) — matches the mockup's tab bars
 * (e.g. "Solicitudes · Seguimientos · Completadas · Agenda").
 */
export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn(styles['tabs-list'], className)} {...props} />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger ref={ref} className={cn(styles['tabs-trigger'], className)} {...props} />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn(styles['tabs-content'], className)} {...props} />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
