import * as React from 'react';

/**
 * In-memory toast store (adapted from shadcn/ui's use-toast).
 *
 * State lives in a module-level singleton and React state — NOT localStorage or
 * any persistent store (per T-020 constraints). Pair with <Toaster />, which
 * renders whatever is queued here.
 */
export interface ToasterToast {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: 'default' | 'success' | 'destructive' | 'warning';
  /** Controlled open state, managed by the store. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
}

const TOAST_LIMIT = 4;
const TOAST_REMOVE_DELAY = 400; // ms to keep a closed toast mounted for its exit animation

type Toast = Omit<ToasterToast, 'id'>;

let count = 0;
function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type Action =
  | { type: 'ADD_TOAST'; toast: ToasterToast }
  | { type: 'UPDATE_TOAST'; toast: Partial<ToasterToast> & { id: string } }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string };

interface State {
  toasts: ToasterToast[];
}

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };
const removeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleRemoval(toastId: string): void {
  if (removeTimeouts.has(toastId)) return;
  const timeout = setTimeout(() => {
    removeTimeouts.delete(toastId);
    dispatch({ type: 'REMOVE_TOAST', toastId });
  }, TOAST_REMOVE_DELAY);
  removeTimeouts.set(toastId, timeout);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TOAST':
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case 'UPDATE_TOAST':
      return {
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      };
    case 'DISMISS_TOAST': {
      const { toastId } = action;
      if (toastId) {
        scheduleRemoval(toastId);
      } else {
        state.toasts.forEach((t) => scheduleRemoval(t.id));
      }
      return {
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined ? { ...t, open: false } : t,
        ),
      };
    }
    case 'REMOVE_TOAST':
      if (action.toastId === undefined) return { toasts: [] };
      return { toasts: state.toasts.filter((t) => t.id !== action.toastId) };
    default:
      return state;
  }
}

function dispatch(action: Action): void {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

export interface ToastHandle {
  id: string;
  dismiss: () => void;
  update: (props: Partial<ToasterToast>) => void;
}

/** Queue a toast imperatively. Returns handles to update or dismiss it. */
export function toast(props: Toast): ToastHandle {
  const id = genId();
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id });
  const update = (next: Partial<ToasterToast>) =>
    dispatch({ type: 'UPDATE_TOAST', toast: { ...next, id } });

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return { id, dismiss, update };
}

/** Subscribe to the toast store and get imperative helpers. */
export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  };
}
