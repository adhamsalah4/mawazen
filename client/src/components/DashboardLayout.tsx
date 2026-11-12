import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CurrencySymbol } from "@/components/CurrencySymbol";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard,
  LogOut,
  PanelRight,
  Users,
  Briefcase,
  FileText,
  Bot,
  Calendar,
  ListChecks,
  BarChart3,
  Settings,
  Bell,
  Scale,
  Store,
  ClipboardList,
  BookOpen,
  MessageSquareText,
  Wand2,
  Crown,
  FolderOpen,
  Wallet,
  FileStack,
  Globe,
  Mail,
  Newspaper,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

type MenuItem = {
  icon: React.ElementType;
  label: string;
  labelEn: string;
  path: string;
};

const InvoiceMenuIcon = (props: { className?: string }) => (
  <CurrencySymbol size={16} className={props.className ?? ""} />
);
const menuGroups: { title: string; items: MenuItem[] }[] = [
  {
    title: "الرئيسية",
    items: [
      { icon: LayoutDashboard, label: "لوحة التحكم", labelEn: "Dashboard", path: "/dashboard" },
    ],
  },
  {
    title: "العمل القانوني",
    items: [
      { icon: Users, label: "العملاء", labelEn: "Clients", path: "/clients" },
      { icon: Briefcase, label: "القضايا", labelEn: "Cases", path: "/cases" },
      { icon: ListChecks, label: "المهام", labelEn: "Tasks", path: "/tasks" },
      { icon: FileText, label: "المستندات", labelEn: "Documents", path: "/documents" },
      { icon: Calendar, label: "التقويم والجلسات", labelEn: "Calendar", path: "/calendar" },
    ],
  },
  {
    title: "الذكاء الاصطناعي",
    items: [
      { icon: Bot, label: "المساعد الذكي", labelEn: "AI Assistant", path: "/ai-assistant" },
      { icon: Wand2, label: "أدوات قانونية ذكية", labelEn: "Legal Tools", path: "/legal-tools" },
    ],
  },
  {
    title: "الجدولة والمالية",
    items: [
      { icon: InvoiceMenuIcon, label: "الفواتير", labelEn: "Invoices", path: "/invoices" },
      { icon: Wallet, label: "المدفوعات", labelEn: "Payments", path: "/payments" },
    ],
  },
  {
    title: "الخدمات",
    items: [
      { icon: FileStack, label: "مشاريع الخدمات", labelEn: "Service Projects", path: "/service-projects" },
      { icon: Store, label: "كتالوج الخدمات", labelEn: "Service Catalog", path: "/service-catalog" },
      { icon: ClipboardList, label: "طلبات الخدمات", labelEn: "Service Requests", path: "/service-requests" },
    ],
  },
  {
    title: "إدارة المحتوى",
    items: [
      { icon: Globe, label: "صفحات الموقع", labelEn: "Site Pages", path: "/cms/pages" },
      { icon: Users, label: "فريق الموقع", labelEn: "Site Team", path: "/cms/team" },
      { icon: BookOpen, label: "ممارسات الموقع", labelEn: "Site Practices", path: "/cms/practices" },
      { icon: MessageSquareText, label: "آراء العملاء", labelEn: "Testimonials", path: "/cms/testimonials" },
      { icon: Mail, label: "رسائل التواصل", labelEn: "Contact Messages", path: "/cms/messages" },
      { icon: Newspaper, label: "المدونة", labelEn: "Blog", path: "/cms/blog" },
    ],
  },
  {
    title: "التقارير والنظام",
    items: [
      { icon: BarChart3, label: "التحليلات", labelEn: "Analytics", path: "/analytics" },
      { icon: FolderOpen, label: "التقارير", labelEn: "Reports", path: "/reports" },
      { icon: ListChecks, label: "تاريخ العمليات", labelEn: "History", path: "/activity-log" },
      { icon: Bell, label: "الإشعارات", labelEn: "Notifications", path: "/notifications" },
      { icon: Users, label: "الفريق", labelEn: "Team", path: "/team" },
      { icon: Settings, label: "الإعدادات", labelEn: "Settings", path: "/settings" },
    ],
  },
];

const ownerMenuItem: MenuItem = {
  icon: Crown,
  label: "لوحة المالك",
  labelEn: "Owner",
  path: "/owner",
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });

  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }


  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-gold/10 flex items-center justify-center shadow-lg border-gold/30">
              <img src="/logo.png" alt="موازين" className="h-full w-full object-cover" />
            </div>
            <h1 className="text-3xl font-bold text-gold-gradient">موازين</h1>
          </div>
          


          <div className="flex flex-col items-center gap-4 text-center">
            <h2 className="text-xl font-semibold text-foreground">
              مرحباً بك في نظام موازين
            </h2>
            
            <p className="text-sm text-muted-foreground max-w-sm">
              نظام إدارة المكاتب القانونية المتكامل مع الذكاء الاصطناعي المتخصص
              في القانون السعودي
            </p>
          </div>

          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full btn-gold text-lg py-6 rounded-xl"
          >
            تسجيل الدخول
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          "--sidebar-width-icon": "4rem",
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const sidebarScrollPositions = useRef<Record<string, number>>({});
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { data: isOwner } = trpc.auth.isOwner.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const effectiveMenuGroups: typeof menuGroups = isOwner
    ? [...menuGroups, { title: "لوحة المالك", items: [ownerMenuItem] }]
    : menuGroups;

  const getAllItems = (): MenuItem[] =>
    effectiveMenuGroups.flatMap((g) => g.items);
  const activeMenuItem = getAllItems().find((item) => item.path === location);
  const isMobile = useIsMobile();
  const { data: unreadNotifications } = trpc.notifications.list.useQuery(
    { unreadOnly: true },
    { enabled: Boolean(user) }
  );
  const unreadCount = unreadNotifications?.length ?? 0;
  
const handleMenuClick = (path: string) => {
  if (sidebarScrollRef.current) {
    sidebarScrollPositions.current[location] = sidebarScrollRef.current.scrollTop;
  }
  requestAnimationFrame(() => {
    setLocation(path);
  });
};
  
useEffect(() => {
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual';
  }
}, []);


  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);
  useEffect(() => {
  requestAnimationFrame(() => {
    if (sidebarScrollRef.current) {
      const savedScroll = sidebarScrollPositions.current[location];

      if (savedScroll !== undefined) {
        sidebarScrollRef.current.scrollTop = savedScroll;
      }
    }
  });
}, [location]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // RTL: calculate from right side
      const sidebarRight =
        sidebarRef.current?.getBoundingClientRect().right ?? window.innerWidth;
      const newWidth = sidebarRight - e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };
    

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef} data-print-hide>
        <Sidebar
          collapsible="icon"
          className="border-l-0 border-r border-border/50"
          side="right"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 border-b border-border/40 px-3 flex items-center group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:min-h-14 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:py-2">
            <div className="flex items-center gap-3 transition-all w-full group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:gap-2">
              {!isCollapsed ? (
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0 overflow-hidden">
                    <img src="/logo.png" alt="موازين" className="h-full w-full object-cover" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-base text-gold-gradient leading-tight">
                      موازين
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      المساعد القانوني الذكي
                    </span>
                  </div>
                </div>
              ) : null}
              {isCollapsed ? (
                <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center overflow-hidden shrink-0">
                  <img src="/logo.png" alt="موازين" className="h-full w-full object-cover" />
                </div>
              ) : null}
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 min-w-8 flex items-center justify-center hover:bg-accent/60 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 shrink-0"
                aria-label="تبديل القائمة"
              >
                <PanelRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </SidebarHeader>
          

          
         <SidebarContent 
  ref={sidebarScrollRef}
  className="gap-0 py-4 px-3 overflow-y-auto overflow-x-hidden group-data-[collapsible=icon]:py-2 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:overflow-y-auto group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center"
>
            
            {isCollapsed ? (
              
              <SidebarMenu className="flex flex-col gap-2 min-w-0 w-full">
                {getAllItems().map((item) => {
                  const isActive = location === item.path;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => handleMenuClick(item.path)}

                        tooltip={item.label}
                        className={`h-12 min-h-[48px] px-3 transition-all font-medium rounded-lg ${
                          isActive
                            ? "bg-gold/15 text-gold border border-gold/25 shadow-sm"
                            : "hover:bg-accent/60 border border-transparent"
                        }`}
                      >
                        <item.icon
                          className={`h-4 w-4 shrink-0 ${isActive ? "text-gold" : "text-muted-foreground"}`}
                        />
                        <span className={isActive ? "text-gold font-semibold" : ""}>
                          {item.label}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            ) : (
              <>
                {effectiveMenuGroups.map((group, idx) => (
                  <div key={group.title}>
                    {idx > 0 && (
                      <SidebarSeparator className="my-5 mx-1 bg-border/60" />
                    )}
                    <SidebarGroup className="py-1.5 first:pt-0 overflow-hidden">
                      <SidebarGroupLabel className="px-2 py-2.5 mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 h-auto leading-tight bg-sidebar/40 -mx-1 px-3 rounded-md border-s-2 border-gold/25">
                        {group.title}
                      </SidebarGroupLabel>
                      <SidebarGroupContent>
                        <SidebarMenu className="flex flex-col gap-2.5 min-w-0 w-full">
                          {group.items.map((item) => {
                            const isActive = location === item.path;
                            return (
                              <SidebarMenuItem key={item.path}>
                                <SidebarMenuButton
                                  isActive={isActive}
                                  onClick={() => handleMenuClick(item.path)}

                                  tooltip={item.label}
                                  className={`h-12 min-h-[48px] px-3 transition-all font-medium rounded-lg ${
                                    isActive
                                      ? "bg-gold/15 text-gold border border-gold/25 shadow-sm"
                                      : "hover:bg-accent/60 border border-transparent"
                                  }`}
                                >
                                  <item.icon
                                    className={`h-4 w-4 shrink-0 ${isActive ? "text-gold" : "text-muted-foreground"}`}
                                  />
                                  <span className={isActive ? "text-gold font-semibold" : ""}>
                                    {item.label}
                                  </span>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            );
                          })}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </SidebarGroup>
                  </div>
                ))}
              </>
            )}
          </SidebarContent>

          <SidebarFooter className="p-2 border-t border-border/40 bg-sidebar/50 group-data-[collapsible=icon]:items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-accent/60 transition-all w-full text-right group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar">
                  <Avatar className="h-9 w-9 border-2 border-gold/25 shrink-0 ring-2 ring-background/50">
                    <AvatarFallback className="text-sm font-bold bg-gold/15 text-gold">
                      {user?.name?.charAt(0).toUpperCase() || "م"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-semibold truncate leading-tight text-foreground">
                      {user?.name || "مستخدم"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {user?.role === "admin" ? "مدير النظام" : "محامي"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl border-border/60 shadow-lg">
                <div className="px-3 py-2.5 border-b border-border/40">
                  <p className="text-sm font-semibold truncate">{user?.name || "مستخدم"}</p>
                  {user?.email && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                  )}
                </div>
                <DropdownMenuItem
                  onClick={() => setLocation("/settings")}
                  className="cursor-pointer rounded-lg my-1 mx-1"
                >
                  <Settings className="ml-2 h-4 w-4 shrink-0" />
                  <span>الإعدادات</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive rounded-lg my-1 mx-1"
                >
                  <LogOut className="ml-2 h-4 w-4 shrink-0" />
                  <span>تسجيل الخروج</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-gold/30 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="bg-background">
        {/* Top Header Bar */}
       <header
  className="flex border-b border-border/40 h-14 sm:h-16 items-center justify-between bg-background/80 px-4 sm:px-6 backdrop-blur-md sticky top-0 z-40 shadow-sm shadow-black/5"
  data-print-hide
>
  <div className="flex items-center gap-3 min-w-0 flex-1">
    {isMobile && (
      <SidebarTrigger className="h-9 w-9 shrink-0 rounded-lg border border-border/50 hover:bg-accent/50" />
    )}
    <div className="flex flex-col min-w-0">
      <span className="font-semibold text-foreground truncate">
        {activeMenuItem?.label ?? "لوحة التحكم"}
      </span>
      <span className="text-[11px] sm:text-xs text-muted-foreground">
        {activeMenuItem?.labelEn ?? "Dashboard"}
      </span>
    </div>
  </div>
             {/* Search  */}
  
  {/* Right side - Notifications */}
  <div className="flex items-center gap-1 shrink-0">
    <Button
      variant="ghost"
      size="icon"
      className="relative h-9 w-9 rounded-lg hover:bg-accent/60"
      onClick={() => setLocation("/notifications")}
      aria-label="الإشعارات"
    >
      <Bell className="h-5 w-5 text-muted-foreground" />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-gold rounded-full ring-2 ring-background" />
      )}
    </Button>
  </div>
</header>

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}
