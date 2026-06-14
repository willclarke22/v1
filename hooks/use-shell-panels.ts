"use client";

import { useMemo, useState } from "react";
import type { SidebarTab } from "@/ui/learning-space/shell/sidebar";

export function useShellPanels(focusedTopicId: string | null) {
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<SidebarTab>("progress");

  const [isRightPanelOpenWhileUnfocused, setIsRightPanelOpenWhileUnfocused] =
    useState(false);
  const [isRightPanelDismissedWhileFocused, setIsRightPanelDismissedWhileFocused] =
    useState(false);

  const isRightPanelOpen = useMemo(() => {
    const isFocused = focusedTopicId !== null;

    return isFocused
      ? !isRightPanelDismissedWhileFocused
      : isRightPanelOpenWhileUnfocused;
  }, [
    focusedTopicId,
    isRightPanelDismissedWhileFocused,
    isRightPanelOpenWhileUnfocused,
  ]);

  function toggleRightPanel() {
    if (focusedTopicId) {
      setIsRightPanelDismissedWhileFocused((prev) => !prev);
    } else {
      setIsRightPanelOpenWhileUnfocused((prev) => !prev);
    }
  }

  return {
    isLeftPanelOpen,
    setIsLeftPanelOpen,
    leftPanelTab,
    setLeftPanelTab,
    isRightPanelOpenWhileUnfocused,
    setIsRightPanelOpenWhileUnfocused,
    isRightPanelDismissedWhileFocused,
    setIsRightPanelDismissedWhileFocused,
    isRightPanelOpen,
    toggleRightPanel,
  };
}