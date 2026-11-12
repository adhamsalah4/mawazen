import DashboardLayout from "@/components/DashboardLayout";
import { AIChatBox, type Message as AIMessage } from "@/components/AIChatBox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { TRPCClientError } from "@trpc/client";
import { useLocation } from "wouter";
import {
  Scale,
  FileText,
  Search,
  Shield,
  Lightbulb,
  Sparkles,
  Plus,
} from "lucide-react";

type StoredChatSession = {
  sessionId: string;
  title: string;
  updatedAt: number;
  messages: AIMessage[];
};

const CHAT_SESSIONS_STORAGE_KEY = "mawazen.aiChat.sessions.v1";
const CHAT_ACTIVE_SESSION_STORAGE_KEY = "mawazen.aiChat.activeSessionId.v1";

const quickActions = [
  {
    icon: Search,
    title: "تحليل قضية",
    description: "تحليل شامل للقضية وتحديد نقاط القوة والضعف",
    prompt: "أريد تحليل قضية قانونية. القضية تتعلق بـ",
  },
  {
    icon: Shield,
    title: "استراتيجية دفاع",
    description: "اقتراح استراتيجيات دفاع فعالة",
    prompt: "أحتاج استراتيجية دفاع لقضية",
  },
  {
    icon: FileText,
    title: "صياغة مذكرة",
    description: "إنشاء مذكرة قانونية احترافية",
    prompt: "أريد صياغة مذكرة قانونية في",
  },
  {
    icon: Lightbulb,
    title: "سوابق قضائية",
    description: "البحث في السوابق القضائية السعودية",
    prompt: "ابحث عن سوابق قضائية في القانون السعودي تتعلق بـ",
  },
];

const supportedSystems = [
  "هيئة السوق المالية",
  "البنك المركزي السعودي",
  "هيئة الزكاة والضريبة والجمارك",
  "هيئة كفاءة الإنفاق",
  "هيئة الرقابة ومكافحة الفساد",
  "بوابة مُعين",
  "منصة ناجز",
  "النظام الأساسي للحكم",
  "نظام مجلس الوزراء",
  "نظام مجلس الشورى",
  "نظام المناطق",
  "نظام البيعة",
  "نظام القضاء",
  "نظام ديوان المظالم",
  "نظام المرافعات الشرعية",
  "نظام الإجراءات الجزائية",
  "نظام التنفيذ",
  "نظام المحاماة",
  "نظام التوثيق",
  "نظام العمل السعودي",
  "لائحة نظام العمل",
  "نظام التأمينات الاجتماعية",
  "نظام مكافحة التستر",
  "نظام الموارد البشرية في الخدمة المدنية",
  "نظام الخدمة العسكرية",
  "نظام التدريب التقني والمهني",
  "نظام الشركات",
  "نظام الإفلاس",
  "نظام التجارة الإلكترونية",
  "نظام السجل التجاري",
  "نظام العلامات التجارية",
  "نظام الأسماء التجارية",
  "نظام المنافسة",
  "نظام الامتياز التجاري",
  "نظام الغرف التجارية",
  "نظام الوكالات التجارية",
  "نظام الزكاة",
  "نظام ضريبة القيمة المضافة",
  "نظام ضريبة الدخل",
  "نظام الجمارك الموحد",
  "نظام الإيرادات العامة",
  "نظام الدين العام",
  "نظام المنافسات والمشتريات الحكومية",
  "نظام مكافحة الرشوة",
  "نظام مكافحة غسل الأموال",
  "نظام مكافحة الإرهاب وتمويله",
  "نظام الجرائم المعلوماتية",
  "نظام مكافحة التزوير",
  "نظام مكافحة المخدرات",
  "نظام الأسلحة",
  "نظام حماية الأموال العامة",
  "نظام تأديب الموظفين",
  "نظام حماية المبلغين",
  "نظام نزاهة",
  "نظام حوكمة الجهات الحكومية",
  "نظام الأحوال الشخصية",
  "نظام المعاملات المدنية",
  "نظام الإثبات",
  "نظام التركات",
  "نظام الوصايا",
  "نظام الأوقاف",
  "نظام حماية البيانات الشخصية",
  "نظام التعاملات الإلكترونية",
  "نظام الأمن السيبراني",
  "نظام الحكومة الرقمية",
  "نظام التسجيل العيني للعقار",
  "نظام نزع الملكية",
  "نظام الوساطة العقارية",
  "نظام المساهمات العقارية",
  "نظام البلديات",
  "نظام التخطيط العمراني",
  "اللوائح التنفيذية",
  "التعاميم الوزارية",
  "الأدلة الإجرائية",
  "القرارات التفسيرية",
];

function safeLoadSessions(): StoredChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAT_SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as StoredChatSession[];
  } catch {
    return [];
  }
}

function safeSaveSessions(sessions: StoredChatSession[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAT_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch {}
}

function safeLoadActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CHAT_ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeSaveActiveSessionId(sessionId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAT_ACTIVE_SESSION_STORAGE_KEY, sessionId);
  } catch {}
}

function sessionTitleFromMessages(messages: AIMessage[]) {
  const firstUser = messages.find((m) => m.role === "user")?.content?.trim();
  if (!firstUser) return "محادثة";
  return firstUser.length > 28 ? `${firstUser.slice(0, 28)}...` : firstUser;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [sessionId, setSessionId] = useState(() => nanoid());
  const [chatSessions, setChatSessions] = useState<StoredChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();

  const chatSessionsSorted = useMemo(() => {
    return [...chatSessions].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [chatSessions]);

  const historySelectValue = useMemo(() => {
    return chatSessionsSorted.some((s) => s.sessionId === sessionId) ? sessionId : undefined;
  }, [chatSessionsSorted, sessionId]);

  useEffect(() => {
    const storedSessions = safeLoadSessions();
    setChatSessions(storedSessions);

    const activeId = safeLoadActiveSessionId();
    if (activeId) {
      const active = storedSessions.find((s) => s.sessionId === activeId);
      if (active) {
        setSessionId(active.sessionId);
        setMessages(active.messages ?? []);
      } else {
        setSessionId(activeId);
      }
    } else if (storedSessions.length > 0) {
      const latest = [...storedSessions].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (latest) {
        setSessionId(latest.sessionId);
        setMessages(latest.messages ?? []);
        safeSaveActiveSessionId(latest.sessionId);
      }
    }
  }, []);

  useEffect(() => {
    safeSaveActiveSessionId(sessionId);

    setChatSessions((prev) => {
      const existing = prev.find((s) => s.sessionId === sessionId);
      const hasAnyMessages = messages.length > 0;
      if (!hasAnyMessages && !existing) {
        safeSaveSessions(prev);
        return prev;
      }

      const next: StoredChatSession[] = prev.filter((s) => s.sessionId !== sessionId);
      if (hasAnyMessages) {
        next.unshift({
          sessionId,
          title: sessionTitleFromMessages(messages),
          updatedAt: Date.now(),
          messages,
        });
      } else if (existing) {
        next.unshift(existing);
      }

      const limited = next.slice(0, 20);
      safeSaveSessions(limited);
      return limited;
    });
  }, [messages, sessionId]);

  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.message,
        },
      ]);
      setSessionId(data.sessionId);
      setIsLoading(false);
    },
    onError: (error) => {
      // اشتراك غير فعّال
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "FORBIDDEN"
      ) {
        setMessages([
          {
            role: "assistant",
            content:
              "لا يمكنك استخدام المساعد حالياً لأن اشتراكك السنوي غير فعّال. يرجى الانتقال إلى صفحة المدفوعات لتجديد الاشتراك.",
          },
        ]);
        setIsLoading(false);
        // توجيه المستخدم إلى صفحة المدفوعات بعد لحظات بسيطة
        setTimeout(() => setLocation("/payments"), 800);
        return;
      }

      // أي خطأ آخر عام
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى بعد لحظات.",
        },
      ]);
      setIsLoading(false);
    },
  });

  const handleSend = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || isLoading) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
    ]);

    setIsLoading(true);

    chatMutation.mutate({
      message: trimmed,
      sessionId,
    });
  };

  const resumeSession = (id: string) => {
    const found = chatSessions.find((s) => s.sessionId === id);
    setSessionId(id);
    safeSaveActiveSessionId(id);
    if (found) setMessages(found.messages ?? []);
    else setMessages([]);
  };

  const startNewChat = () => {
    setMessages([]);
    const id = nanoid();
    setSessionId(id);
    safeSaveActiveSessionId(id);
  };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex gap-6">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          <Card className="card-gold flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <CardHeader className="border-b border-border/50 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                    <Scale className="h-5 w-5 text-gold" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">المساعد القانوني الذكي</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      متخصص في القانون السعودي
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {chatSessionsSorted.length > 0 ? (
                    <Select value={historySelectValue} onValueChange={resumeSession}>
                      <SelectTrigger size="sm" className="max-w-[220px]">
                        <SelectValue placeholder="المحادثات السابقة" />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {chatSessionsSorted.map((s) => (
                          <SelectItem key={s.sessionId} value={s.sessionId}>
                            {s.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startNewChat}
                    className="hover:border-gold/50"
                  >
                    <Plus className="h-4 w-4 ml-1" />
                    محادثة جديدة
                  </Button>
                </div>
              </div>
            </CardHeader>
            <div className="flex-1 flex flex-col p-4 pt-0">
              <AIChatBox
                messages={messages}
                onSendMessage={handleSend}
                isLoading={isLoading}
                placeholder="اكتب سؤالك القانوني هنا..."
                emptyStateMessage="أنا مساعدك القانوني الذكي المتخصص في القانون السعودي. يمكنك سؤالي عن تحليل القضايا، الثغرات القانونية، وصياغة المذكرات."
                suggestedPrompts={quickActions.map((action) => action.prompt)}
                className="h-full"
                height="100%"
              />
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                المساعد الذكي متخصص في القانون السعودي. للحصول على استشارة
                قانونية رسمية، يرجى التواصل مع محامٍ مرخص.
              </p>
            </div>
          </Card>
        </div>

        {/* Sidebar - Features */}
        <div className="hidden lg:block w-80">
          <Card className="card-gold h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-gold" />
                قدرات المساعد
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-secondary/50 border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Search className="h-4 w-4 text-gold" />
                    <h4 className="font-medium text-sm">تحليل القضايا</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    تحليل شامل للقضايا وتحديد نقاط القوة والضعف والثغرات
                    القانونية
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-secondary/50 border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-gold" />
                    <h4 className="font-medium text-sm">استراتيجيات الدفاع</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    اقتراح استراتيجيات دفاع مبنية على السوابق القضائية السعودية
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-secondary/50 border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-gold" />
                    <h4 className="font-medium text-sm">صياغة المذكرات</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    إنشاء مذكرات قانونية ولوائح دعوى احترافية
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-secondary/50 border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4 text-gold" />
                    <h4 className="font-medium text-sm">السوابق القضائية</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    البحث في السوابق والأحكام القضائية ذات الصلة
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-border/50">
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <Scale className="h-4 w-4 text-gold" />
                  الأنظمة المدعومة
                </h4>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-auto pr-1">
                  {supportedSystems.map((system) => (
                    <span
                      key={system}
                      className="text-[10px] px-2 py-1 rounded-full bg-gold/10 text-gold border border-gold/20"
                    >
                      {system}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
