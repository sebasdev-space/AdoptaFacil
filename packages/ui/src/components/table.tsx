import * as React from 'react';
import { cn } from '../lib/utils';
import styles from './table.module.scss';

/** Data table — uppercase small-caps headers, hairline row dividers (BEM+SCSS). Wraps the native <table> for built-in semantics. */
export const Table = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className={styles['table-wrapper']}>
    <table ref={ref} className={cn(styles.table, className)} {...props} />
  </div>
));
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn(styles['table-header'], className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn(styles['table-body'], className)} {...props} />
));
TableBody.displayName = 'TableBody';

export const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot ref={ref} className={cn(styles['table-footer'], className)} {...props} />
));
TableFooter.displayName = 'TableFooter';

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => <tr ref={ref} className={className} {...props} />);
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, scope = 'col', ...props }, ref) => (
  <th ref={ref} scope={scope} className={cn(styles['table-head'], className)} {...props} />
));
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn(styles['table-cell'], className)} {...props} />
));
TableCell.displayName = 'TableCell';

export const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn(styles['table-caption'], className)} {...props} />
));
TableCaption.displayName = 'TableCaption';
