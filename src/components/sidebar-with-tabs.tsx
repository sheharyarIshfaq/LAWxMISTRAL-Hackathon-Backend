"use client";

import { Logo } from "@/components/logo";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AnimatePresence, MotionConfig, Reorder, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface Tab {
  id: string;
  activeNavId: string;
}

export interface SidebarWithTabsProps {
  logo?: ReactNode;
  companyName?: string;
  navItems: NavItem[];
  renderContent: (navId: string) => ReactNode;
  defaultNavId?: string;
  /** Deep link: the open tab starts on this section. */
  entryNav?: string;
  /** Separate the NGO desk from the investor book. */
  storageKey: string;
  /** Rewrite stored section ids so renamed nav items still open. */
  mapNavId?: (navId: string) => string;
  footer?: ReactNode;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string;
}

interface TabsContextValue {
  tabs: Tab[];
  activeTabId: string;
  activeNavId: string;
  setActiveNav: (navId: string) => void;
  addTab: (navId?: string) => void;
  closeTab: (tabId: string) => void;
  closeOthers: (tabId: string) => void;
  closeToRight: (tabId: string) => void;
  closeToLeft: (tabId: string) => void;
  closeAll: () => void;
  setActiveTab: (tabId: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("useTabs must be used within SidebarWithTabs");
  return context;
}

function subscribe() {
  return () => {};
}

function readTabs(key: string, fallback: TabState): TabState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as TabState;
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0 || !parsed.activeTabId) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function withEntry(state: TabState, entry?: string): TabState {
  if (!entry) return state;
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === state.activeTabId ? { ...tab, activeNavId: entry } : tab)),
  };
}

function ChromeTab({
  tab,
  isActive,
  isLast,
  canClose,
  navItems,
  hasRightNeighborActive,
  onTabClick,
  onTabClose,
  onCloseOthers,
  onCloseToRight,
  onCloseToLeft,
  hasOtherTabs,
  hasTabsToRight,
  hasTabsToLeft,
  resolveNavId,
}: {
  tab: Tab;
  isActive: boolean;
  isLast: boolean;
  canClose: boolean;
  navItems: NavItem[];
  hasRightNeighborActive: boolean;
  onTabClick: () => void;
  onTabClose: () => void;
  onCloseOthers: () => void;
  onCloseToRight: () => void;
  onCloseToLeft: () => void;
  hasOtherTabs: boolean;
  hasTabsToRight: boolean;
  hasTabsToLeft: boolean;
  resolveNavId?: (navId: string) => string;
}) {
  const nav = navItems.find((item) => item.id === (resolveNavId?.(tab.activeNavId) ?? tab.activeNavId));
  const Icon = nav?.icon;
  const label = nav?.label || "New tab";
  const tabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !tabRef.current) return;
    tabRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    if (!isLast) return;
    const timer = window.setTimeout(() => {
      tabRef.current?.closest(".flex")?.querySelector(".new-tab-btn")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isActive, isLast]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          role="tab"
          aria-selected={isActive}
          tabIndex={isActive ? 0 : -1}
          ref={tabRef}
          className={cn(
            "relative ml-[10px] flex min-w-[140px] max-w-[220px] cursor-pointer items-center gap-2 px-4 py-2.5 text-sm transition-colors duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-sidebar-ring sm:ml-0",
            isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={onTabClick}
          onAuxClick={(event) => {
            if (event.button === 1 && canClose) {
              event.preventDefault();
              onTabClose();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onTabClick();
            } else if ((event.key === "Delete" || event.key === "Backspace") && canClose) {
              event.preventDefault();
              onTabClose();
            } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              const item = (event.target as HTMLElement).closest("li");
              const next = event.key === "ArrowRight" ? item?.nextElementSibling : item?.previousElementSibling;
              (next?.querySelector("[role=tab]") as HTMLElement | null)?.focus();
            }
          }}
        >
          {isActive ? (
            <motion.div
              className="absolute inset-0 rounded-t-xl bg-background"
              layoutId="activeTabBg"
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
            >
              <div className="absolute -left-3 bottom-0 h-3 w-3 overflow-hidden">
                <div className="absolute right-0 bottom-0 z-1 h-6 w-6 rounded-full bg-sidebar" />
                <div className="absolute inset-0 bg-background" />
              </div>
              <div className="absolute -right-3 bottom-0 h-3 w-3 overflow-hidden">
                <div className="absolute bottom-0 left-0 z-1 h-6 w-6 rounded-full bg-sidebar" />
                <div className="absolute inset-0 bg-background" />
              </div>
            </motion.div>
          ) : null}
          <div className="relative flex min-w-0 flex-1 items-center gap-2">
            {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
            <span className="flex-1 truncate font-medium">{label}</span>
            {canClose ? (
              <button
                type="button"
                aria-label={`Close ${label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onTabClose();
                }}
                className={cn(
                  "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full",
                  isActive
                    ? "text-muted-foreground hover:bg-elevated hover:text-foreground"
                    : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-sidebar-accent",
                )}
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          {!isActive && !hasRightNeighborActive ? (
            <div className="absolute top-1/2 right-0 h-4 w-px -translate-y-1/2 bg-sidebar-border" />
          ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onTabClose} disabled={!canClose}>
          Close tab
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onCloseOthers} disabled={!hasOtherTabs}>
          Close other tabs
        </ContextMenuItem>
        <ContextMenuItem onClick={onCloseToRight} disabled={!hasTabsToRight}>
          <ChevronRight className="mr-2 h-4 w-4" />
          Close tabs to the right
        </ContextMenuItem>
        <ContextMenuItem onClick={onCloseToLeft} disabled={!hasTabsToLeft}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Close tabs to the left
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SidebarNavigation({
  navItems,
  activeNavId,
  isCollapsed,
  onItemClick,
}: {
  navItems: NavItem[];
  activeNavId: string;
  isCollapsed: boolean;
  onItemClick: (item: NavItem) => void;
}) {
  return (
    <nav className="space-y-1 px-3" aria-label="Dashboard">
      {navItems.map((item) => {
        const isActive = item.id === activeNavId;
        const button = (
          <button
            type="button"
            onClick={() => onItemClick(item)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isCollapsed && "justify-center px-0",
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!isCollapsed ? <span className="text-sm font-medium whitespace-nowrap">{item.label}</span> : null}
            {isActive && !isCollapsed ? (
              <motion.div
                layoutId="activeNavIndicator"
                className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            ) : null}
          </button>
        );
        if (!isCollapsed) return <div key={item.id}>{button}</div>;
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

function MobileSidebar({
  companyName,
  navItems,
  activeNavId,
  onItemClick,
}: {
  companyName: string;
  navItems: NavItem[];
  activeNavId: string;
  onItemClick: (item: NavItem) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="border-r-0 p-0">
        <SheetTitle className="sr-only">Sidebar navigation</SheetTitle>
        <div className="flex h-full flex-col bg-sidebar">
          <div className="flex items-center gap-3 border-b border-sidebar-border p-5">
            <Logo size={30} />
            <span className="font-serif text-lg text-sidebar-foreground">{companyName}</span>
          </div>
          <div className="flex-1 py-4">
            <SidebarNavigation
              navItems={navItems}
              activeNavId={activeNavId}
              isCollapsed={false}
              onItemClick={(item) => {
                onItemClick(item);
                setOpen(false);
              }}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NewTabButton({ navItems, onAddTab }: { navItems: NavItem[]; onAddTab: (navId?: string) => void }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const longPress = useRef(false);

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label="New tab"
          className="new-tab-btn mb-0.5 ml-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
          onPointerDown={() => {
            longPress.current = false;
            timer.current = window.setTimeout(() => {
              longPress.current = true;
              setOpen(true);
            }, 500);
          }}
          onPointerUp={() => {
            if (timer.current) window.clearTimeout(timer.current);
          }}
          onClick={() => {
            if (longPress.current) return;
            setOpen(false);
            onAddTab();
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" sideOffset={8} className="w-48">
        <p className="px-2 py-1.5 text-xs font-medium text-faint">Quick open</p>
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setOpen(false);
              onAddTab(item.id);
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-paper hover:bg-elevated"
          >
            <item.icon className="h-4 w-4 text-faint" />
            {item.label}
          </button>
        ))}
      </HoverCardContent>
    </HoverCard>
  );
}

export function SidebarWithTabs({
  companyName = "Bina.ai",
  navItems,
  renderContent,
  defaultNavId,
  entryNav,
  storageKey,
  mapNavId,
  footer,
}: SidebarWithTabsProps) {
  const mapNav = mapNavId ?? ((id: string) => id);
  const defaultNav = mapNav(entryNav || defaultNavId || navItems[0]?.id || "");
  const fallback = useMemo<TabState>(
    () => ({ tabs: [{ id: "tab-1", activeNavId: defaultNav }], activeTabId: "tab-1" }),
    [defaultNav],
  );
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [local, setLocal] = useState<TabState | null>(null);
  const counter = useRef(1);

  const stored = mounted ? withEntry(readTabs(storageKey, fallback), entryNav) : fallback;
  const state = local ?? stored;
  const { tabs, activeTabId } = state;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const activeNavId = mapNav(activeTab?.activeNavId || defaultNav);
  const activeTabIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));

  const commit = useCallback(
    (next: TabState) => {
      setLocal(next);
      localStorage.setItem(storageKey, JSON.stringify(next));
      const max = next.tabs.reduce((peak, tab) => {
        const match = tab.id.match(/tab-(\d+)/);
        return match ? Math.max(peak, Number(match[1])) : peak;
      }, 1);
      counter.current = max;
    },
    [storageKey],
  );

  const setActiveNav = useCallback(
    (navId: string) => {
      commit({
        ...state,
        tabs: state.tabs.map((tab) => (tab.id === state.activeTabId ? { ...tab, activeNavId: navId } : tab)),
      });
    },
    [commit, state],
  );

  const addTab = useCallback(
    (navId?: string) => {
      counter.current += 1;
      const id = `tab-${counter.current}-${Date.now()}`;
      commit({ tabs: [...state.tabs, { id, activeNavId: navId || defaultNav }], activeTabId: id });
    },
    [commit, defaultNav, state.tabs],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      if (state.tabs.length === 1) return;
      const index = state.tabs.findIndex((tab) => tab.id === tabId);
      const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
      const nextActive =
        state.activeTabId === tabId ? nextTabs[Math.max(0, Math.min(index, nextTabs.length - 1))].id : state.activeTabId;
      commit({ tabs: nextTabs, activeTabId: nextActive });
    },
    [commit, state],
  );

  const closeOthers = useCallback(
    (tabId: string) => {
      const kept = state.tabs.find((tab) => tab.id === tabId);
      if (kept) commit({ tabs: [kept], activeTabId: tabId });
    },
    [commit, state.tabs],
  );

  const closeToRight = useCallback(
    (tabId: string) => {
      const index = state.tabs.findIndex((tab) => tab.id === tabId);
      const nextTabs = state.tabs.slice(0, index + 1);
      commit({
        tabs: nextTabs,
        activeTabId: nextTabs.some((tab) => tab.id === state.activeTabId) ? state.activeTabId : tabId,
      });
    },
    [commit, state],
  );

  const closeToLeft = useCallback(
    (tabId: string) => {
      const index = state.tabs.findIndex((tab) => tab.id === tabId);
      const nextTabs = state.tabs.slice(index);
      commit({
        tabs: nextTabs,
        activeTabId: nextTabs.some((tab) => tab.id === state.activeTabId) ? state.activeTabId : tabId,
      });
    },
    [commit, state],
  );

  const closeAll = useCallback(() => {
    const first = state.tabs[0];
    if (first) commit({ tabs: [first], activeTabId: first.id });
  }, [commit, state.tabs]);

  const contextValue = useMemo<TabsContextValue>(
    () => ({
      tabs,
      activeTabId,
      activeNavId,
      setActiveNav,
      addTab,
      closeTab,
      closeOthers,
      closeToRight,
      closeToLeft,
      closeAll,
      setActiveTab: (tabId: string) => commit({ ...state, activeTabId: tabId }),
    }),
    [tabs, activeTabId, activeNavId, setActiveNav, addTab, closeTab, closeOthers, closeToRight, closeToLeft, closeAll, commit, state],
  );

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={0}>
        <TabsContext.Provider value={contextValue}>
          <div className="flex h-full w-full overflow-hidden bg-sidebar">
            <motion.aside
              initial={false}
              animate={{ width: isCollapsed ? 64 : 240 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="hidden overflow-hidden bg-sidebar md:flex md:flex-col"
            >
              <div className={cn("flex h-[52px] items-center border-b border-sidebar-border px-4", isCollapsed ? "justify-center" : "justify-between")}>
                <div className="flex min-w-0 items-center gap-3">
                  <Logo size={26} />
                  {!isCollapsed ? <span className="truncate font-serif text-lg tracking-tight">{companyName}</span> : null}
                </div>
                {!isCollapsed ? (
                  <Button variant="ghost" size="icon" aria-label="Collapse sidebar" onClick={() => setIsCollapsed(true)}>
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              {isCollapsed ? (
                <div className="flex justify-center border-b border-sidebar-border py-2">
                  <Button variant="ghost" size="icon" aria-label="Expand sidebar" onClick={() => setIsCollapsed(false)}>
                    <PanelLeft className="h-4 w-4 rotate-180" />
                  </Button>
                </div>
              ) : null}
              <div className="scrollbar-hide flex-1 overflow-y-auto py-4">
                <SidebarNavigation
                  navItems={navItems}
                  activeNavId={activeNavId}
                  isCollapsed={isCollapsed}
                  onItemClick={(item) => setActiveNav(item.id)}
                />
              </div>
              <div className="flex h-[73px] items-center overflow-hidden border-t border-sidebar-border px-4">
                {!isCollapsed ? footer : <Logo size={24} className="mx-auto" />}
              </div>
            </motion.aside>

            <div className="relative flex flex-1 flex-col overflow-hidden">
              <div className="flex items-end bg-sidebar pt-2">
                <div className="mb-1 ml-2 shrink-0 self-center md:hidden">
                  <MobileSidebar
                    companyName={companyName}
                    navItems={navItems}
                    activeNavId={activeNavId}
                    onItemClick={(item) => setActiveNav(item.id)}
                  />
                </div>
                <div className="scrollbar-hide flex flex-1 items-end overflow-x-auto">
                  <Reorder.Group as="ol" axis="x" values={tabs} onReorder={(next) => commit({ ...state, tabs: next })} className="flex items-end" role="tablist" aria-label="Open tabs">
                    <AnimatePresence initial={false}>
                      {tabs.map((tab, index) => (
                        <Reorder.Item
                          key={tab.id}
                          value={tab}
                          as="li"
                          className="group relative shrink-0"
                          style={{ zIndex: tab.id === activeTabId ? 10 : 1 }}
                        >
                          <ChromeTab
                            tab={tab}
                            isActive={tab.id === activeTabId}
                            isLast={index === tabs.length - 1}
                            canClose={tabs.length > 1}
                            navItems={navItems}
                            hasRightNeighborActive={index < tabs.length - 1 && tabs[index + 1].id === activeTabId}
                            onTabClick={() => commit({ ...state, activeTabId: tab.id })}
                            onTabClose={() => closeTab(tab.id)}
                            onCloseOthers={() => closeOthers(tab.id)}
                            onCloseToRight={() => closeToRight(tab.id)}
                            onCloseToLeft={() => closeToLeft(tab.id)}
                            hasOtherTabs={tabs.length > 1}
                            hasTabsToRight={index < tabs.length - 1}
                            hasTabsToLeft={index > 0}
                            resolveNavId={mapNavId}
                          />
                        </Reorder.Item>
                      ))}
                    </AnimatePresence>
                  </Reorder.Group>
                  <NewTabButton navItems={navItems} onAddTab={addTab} />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label="Tab actions" className="mb-0.5 mr-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => addTab()}>
                      <Plus className="mr-2 h-4 w-4" />
                      New tab
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={closeAll} disabled={tabs.length < 2}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Close all tabs
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <main id="main" className="flex-1 overflow-hidden bg-sidebar md:pr-3 md:pb-3">
                <div
                  className={cn(
                    "h-full overflow-auto bg-background",
                    "md:rounded-tr-3xl md:rounded-br-3xl md:rounded-bl-3xl",
                    activeTabIndex !== 0 && "md:rounded-tl-3xl",
                  )}
                >
                  {/* Instant swap with a short fade-in (no exit animation: waiting for it made tab changes feel slow). */}
                  <div key={`${activeTabId}-${activeNavId}`} className="rise h-full">
                    {renderContent(activeNavId)}
                  </div>
                </div>
              </main>
            </div>
          </div>
        </TabsContext.Provider>
      </TooltipProvider>
    </MotionConfig>
  );
}
