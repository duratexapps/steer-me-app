import { create } from 'zustand';

// Mirrors the prototype's single bottom toast (#toast) - one message at a
// time, auto-dismissed.
type ToastState = {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
};

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message });
    hideTimer = setTimeout(() => set({ message: null }), 2200);
  },
  clear: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message: null });
  },
}));

export function showToast(message: string) {
  useToastStore.getState().show(message);
}
