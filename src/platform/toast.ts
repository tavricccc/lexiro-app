import { create } from "zustand";

/** The part of sonner's `toast` the shared code calls, shown by <ToastHost />. */
export interface ToastMessage {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

export const useToasts = create<{ current: ToastMessage | null }>(() => ({ current: null }));

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;

function show(kind: ToastMessage["kind"], text: string) {
  if (timer) clearTimeout(timer);
  const id = nextId++;
  useToasts.setState({ current: { id, kind, text } });
  timer = setTimeout(() => {
    if (useToasts.getState().current?.id === id) useToasts.setState({ current: null });
  }, 2800);
}

export const toast = Object.assign((text: string) => show("info", text), {
  success: (text: string) => show("success", text),
  error: (text: string) => show("error", text),
  info: (text: string) => show("info", text),
  dismiss: () => useToasts.setState({ current: null }),
});
