import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import SummaryCard from "./SummaryCard";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  BarChart3,
  Download,
  Filter,
  Calendar,
  TrendingUp,
  Users,
  FileText,
  Printer,
} from "lucide-react";
import { CurrencySymbol } from "@/components/CurrencySymbol";
import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function Reports() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState("month");

  const { data: stats } = trpc.reports.stats.useQuery({
    range: (dateRange === "custom" ? "month" : (dateRange as any)) as
      | "week"
      | "month"
      | "quarter"
      | "year",
  });

  const totalRevenue = stats?.totalRevenue ?? 0;
  const totalExpenses = stats?.totalExpenses ?? 0;
  const netProfit = stats?.netProfit ?? totalRevenue - totalExpenses;
  const totalCases = stats?.totalCases ?? 0;
  const wonCases = stats?.wonCases ?? 0;
  const lostCases = stats?.lostCases ?? 0;
  const totalClients = stats?.totalClients ?? 0;
  const newClients = stats?.newClients ?? 0;
const chartData = totalRevenue === 0
  ? [
      { name: "يناير", revenue: 2000 },
      { name: "فبراير", revenue: 3000 },
      { name: "مارس", revenue: 1500 },
      { name: "أبريل", revenue: 4000 },
    ]
  : [
      { name: "يناير", revenue: totalRevenue * 0.2 },
      { name: "فبراير", revenue: totalRevenue * 0.15 },
      { name: "مارس", revenue: totalRevenue * 0.25 },
      { name: "أبريل", revenue: totalRevenue * 0.4 },
    ];

  const reports = [
    {
      id: "financial",
      title: "التقرير المالي",
      description: "تقرير شامل عن الإيرادات والنفقات",
      icon: (props: { className?: string }) => (
        <CurrencySymbol size={24} className={props.className ?? ""} />
      ),
      metrics: [
        { label: "إجمالي الإيرادات", value: <>{totalRevenue.toLocaleString()} <CurrencySymbol size={14} /></>, change: "-" },
        { label: "إجمالي النفقات", value: <>{totalExpenses.toLocaleString()} <CurrencySymbol size={14} /></>, change: "-" },
        { label: "الربح الصافي", value: <>{netProfit.toLocaleString()} <CurrencySymbol size={14} /></>, change: "-" },
      ],
    },
    
    {
      id: "cases",
      title: "تقرير القضايا",
      description: "إحصائيات شاملة عن القضايا والنتائج",
      icon: FileText,
      metrics: [
        { label: "إجمالي القضايا", value: String(totalCases), change: "-" },
        { label: "القضايا المكسوبة", value: String(wonCases), change: totalCases > 0 ? `${Math.round((wonCases / totalCases) * 100)}%` : "0%" },
        { label: "القضايا الخاسرة", value: String(lostCases), change: totalCases > 0 ? `${Math.round((lostCases / totalCases) * 100)}%` : "0%" },
      ],
      
    },
    {
      id: "performance",
      title: "تقرير الأداء",
      description: "تقييم أداء الفريق والمحامين",
      icon: TrendingUp,
      metrics: [
        { label: "متوسط الإنتاجية", value: "-", change: "-" },
        { label: "رضا العملاء", value: "-", change: "-" },
        { label: "معدل الاحتفاظ", value: "-", change: "-" },
      ],
    },
    {
      id: "clients",
      title: "تقرير العملاء",
      description: "تحليل قاعدة العملاء والعلاقات",
      icon: Users,
      metrics: [
        { label: "إجمالي العملاء", value: String(totalClients), change: "-" },
        { label: "عملاء جدد", value: String(newClients), change: "-" },
        { label: "معدل التحويل", value: "-", change: "-" },
      ],
    },
  ];

  const exportFormats = [
    { format: "PDF", icon: "📄" },
    { format: "Excel", icon: "📊" },
    { format: "CSV", icon: "📋" },
  ];

  const handleExport = (format: string) => {
    if (!selectedReport) {
      toast.error("يرجى اختيار تقرير أولاً");
      return;
    }
    toast.success(`تم تحميل التقرير بصيغة ${format}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-gold" />
              التقارير والتحليلات
            </h1>
            <p className="text-muted-foreground mt-2">
              تقارير شاملة عن أداء مكتبك القانوني
            </p>
          </div>

          <div className="flex items-center gap-2" data-print-hide>
            <Button
              variant="outline"
              className="border-gold/30 hover:border-gold/50"
              onClick={() => window.print()}
              data-print-hide
            >
              <Printer className="h-4 w-4 rtl:mr-2 ml-2" />
              طباعة
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <SummaryCard
    title="إجمالي الإيرادات"
    value={`${totalRevenue.toLocaleString()}`}
    icon={BarChart3}
    change="+12%"
  />

  <SummaryCard
    title="إجمالي القضايا"
    value={totalCases}
    icon={FileText}
    change="+5%"
  />

  <SummaryCard
    title="العملاء"
    value={totalClients}
    icon={Users}
    change="+8%"
  />

  <SummaryCard
    title="الربح الصافي"
    value={`${netProfit.toLocaleString()}`}
    icon={TrendingUp}
    change="+15%"
  />
</div>
        {/* Filters */}
        <Card className="card-gold">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm text-muted-foreground block mb-2">
                  نطاق التاريخ
                </label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="w-full px-4 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground"
                >
                  <option value="week">هذا الأسبوع</option>
                  <option value="month">هذا الشهر</option>
                  <option value="quarter">هذا الربع</option>
                  <option value="year">هذه السنة</option>
                  <option value="custom">مخصص</option>
                </select>
              </div>
              <Button className="bg-gold hover:bg-gold-light text-black font-semibold">
                <Filter className="h-4 w-4 rtl:mr-2 ml-2" />
                تطبيق الفلاتر
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Reports Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reports.map((report) => {
            const Icon = report.icon;
            const isSelected = selectedReport === report.id;
            return (
              <Card
                key={report.id}
                className={`card-gold cursor-pointer transition-all ${
                  isSelected ? "border-gold bg-gold/5 border-gold shadow-lg" : "hover:border-gold/50"
                }`}
                onClick={() => setSelectedReport(report.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-gold/10 rounded-lg">
                        <Icon className="h-6 w-6 text-gold" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{report.title}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {report.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
  <div className="space-y-3">
    {report.metrics.map((metric, idx) => (
      <div
        key={idx}
        className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
      >
        <span className="text-sm text-muted-foreground">
          {metric.label}
        </span>
        <div className="text-right">
          <p className="font-semibold text-foreground">
            {metric.value}
          </p>
          <p className="text-xs text-green-400">{metric.change}</p>
        </div>
      </div>
    ))}
  </div>
 {report.id === "financial" && isSelected && (
  <div className="mt-6 h-52 w-full rounded-xl bg-secondary/20 p-4">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData}>
        
        <XAxis 
          dataKey="name" 
          axisLine={false}
          tickLine={false}
        />

        <Tooltip
        cursor={false} 
          contentStyle={{
            backgroundColor: "#111",
            border: "1px solid #333",
            borderRadius: "8px",
            color: "#fff",
            fontSize: "12px",
            padding: "6px 8px",
          }}
          itemStyle={{
    fontSize: "12px", 
  }}
          labelStyle={{
    color: "#D4AF37",
    fontSize: "11px", 
  }}
        />

        <Bar
          dataKey="revenue"
          fill="#D4AF37"
          radius={[0, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  </div>
)}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Export Section */}
        {selectedReport && (
          <Card className="card-gold">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-gold" />
                تحميل التقرير
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {exportFormats.map((item) => (
                  <Button
                    key={item.format}
                    variant="outline"
                    className="border-gold/30 hover:border-gold/50 h-auto py-6 flex flex-col items-center gap-2"
                    onClick={() => handleExport(item.format)}
                  >
                    <span className="text-2xl">{item.icon}</span>
                    <span>{item.format}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scheduled Reports */}
        <Card className="card-gold">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gold" />
              التقارير المجدولة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">التقرير المالي الشهري</p>
                  <p className="text-sm text-muted-foreground">
                    يتم إرساله كل أول يوم من الشهر
                  </p>
                </div>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  مفعل
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">تقرير الأداء الأسبوعي</p>
                  <p className="text-sm text-muted-foreground">
                    يتم إرساله كل يوم الاثنين
                  </p>
                </div>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  مفعل
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">تقرير العملاء الربع سنوي</p>
                  <p className="text-sm text-muted-foreground">
                    يتم إرساله في نهاية كل ربع سنة
                  </p>
                </div>
                <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                  معطل
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Report Builder */}
        <Card className="card-gold">
          <CardHeader>
            <CardTitle>إنشاء تقرير مخصص</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                قم بإنشاء تقرير مخصص يناسب احتياجات مكتبك
              </p>
              <Button className="w-full bg-gold hover:bg-gold-light text-black font-semibold">
                إنشاء تقرير جديد
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
