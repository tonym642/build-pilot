"use client";

import { createContext, useContext } from "react";

type SidebarContextValue = {
  openMainSidebar: () => void;
};

export const SidebarContext = createContext<SidebarContextValue>({
  openMainSidebar: () => {},
});

export function useMainSidebar() {
  return useContext(SidebarContext);
}
