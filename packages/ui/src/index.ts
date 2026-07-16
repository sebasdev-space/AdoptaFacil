// Public surface of @adoptafacil/ui — the single source of shared components.
// Import the stylesheet separately in the host app: `@adoptafacil/ui/styles.css`.

export { cn } from './lib/utils';

// Button (Sprint 0)
export { Button, buttonVariants, type ButtonProps } from './components/button';

// Form controls
export { Input, type InputProps } from './components/input';
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from './components/select';

// Layout & content
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/card';
export { Badge, badgeVariants, type BadgeProps } from './components/badge';
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from './components/table';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/tabs';

// Overlays
export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  type DialogContentProps,
} from './components/dialog';

// Feedback
export {
  Toast,
  ToastProvider,
  ToastViewport,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
  toastVariants,
  type ToastProps,
} from './components/toast';
export { Toaster } from './components/toaster';
export { useToast, toast, type ToasterToast, type ToastHandle } from './components/use-toast';

// States
export { Skeleton } from './components/skeleton';
export { EmptyState, type EmptyStateProps } from './components/empty-state';
