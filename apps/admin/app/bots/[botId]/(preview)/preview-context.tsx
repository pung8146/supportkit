'use client';

import type { WidgetConfig } from '@supportkit/widget/protocol';
import { createContext, useContext, useState, type ReactNode } from 'react';

type PreviewState = {
  /** What the preview shows: saved settings plus unsaved edits from the widget tab. */
  draft: WidgetConfig;
  setDraft: (config: WidgetConfig) => void;
  saved: WidgetConfig;
  setSaved: (config: WidgetConfig) => void;
};

const PreviewContext = createContext<PreviewState | null>(null);

export function PreviewProvider({ initial, children }: { initial: WidgetConfig; children: ReactNode }) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  return <PreviewContext.Provider value={{ draft, setDraft, saved, setSaved }}>{children}</PreviewContext.Provider>;
}

export function usePreview() {
  const state = useContext(PreviewContext);
  if (!state) throw new Error('usePreview must be used inside PreviewProvider');
  return state;
}
