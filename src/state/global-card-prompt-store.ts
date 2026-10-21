import { create } from 'zustand';

// Opens the "Global card needed" prompt (src/components/GlobalCardNeededModal.tsx, mounted once in the root layout).
type PromptState = {
  problem: 'missing' | 'expired' | null;
  open: (problem: 'missing' | 'expired') => void;
  close: () => void;
};

export const useGlobalCardPrompt = create<PromptState>((set) => ({
  problem: null,
  open: (problem) => set({ problem }),
  close: () => set({ problem: null }),
}));
