"use client";

import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, User, Trash2, Filter } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type EntityType = "client" | "case" | "document" | null;

export default function ActivityLogPage() {
  const [selectedType, setSelectedType] = useState<EntityType>(null);

  const { data: logs = [], isLoading, refetch } = trpc.activityLogs.useQuery({
    limit: 100,
    entityType: selectedType ?? undefined,
  });

  const deleteMutation = trpc.deleteActivityLog.useMutation({
    onSuccess: () => refetch(),
  });

  const handleDelete = async (id: number) => {
    if (confirm("هل أنت متأكد من حذف هذا السجل؟")) {
      await deleteMutation.mutateAsync({ id });
    }
  };

  const formatDateTime = (date: string | Date) => {
    return new Date(date).toLocaleString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
  <DashboardLayout>
  <div className="space-y-4 p-3 bg-[#0f0f1a] min-h-screen text-white" dir="rtl">
    {/* Header */}
    <div className="sticky text-card-foreground flex flex-col gap-2 rounded-lg py-3">
      <h1 className="text-xl font-bold text-gold-gradient">سجل العمليات</h1>
      <p className="text-xs text-muted-foreground mt-1">عرض جميع الأنشطة والتغييرات في النظام</p>
    </div>

    {/* Filters Section */}
    <Card className="bg-[#161625] border-none shadow-md rounded-lg">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 text-sm">
            <Filter className="h-3 w-3" />
            فلترة النتائج
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {[
            { label: "الكل", value: null },
            { label: "العملاء", value: "client" },
            { label: "القضايا", value: "case" },
            { label: "المستندات", value: "document" },
          ].map((tab) => (
            <button
              key={tab.label}
              onClick={() => setSelectedType(tab.value as EntityType)}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-all duration-300 font-medium text-xs",
                selectedType === tab.value
                  ? "bg-gold text-black shadow-sm shadow-gold/20"
                  : "bg-[#1c1c2d] text-gray-300 hover:bg-[#252538]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>

    {/* Activity List Section */}
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-base font-semibold">
          <Clock className="w-3 h-3 text-gold" />
          <span>سجل الأنشطة</span>
        </div>
        <span className="text-gray-400 bg-[#1c1c2d] px-2 py-0.5 rounded-full text-xs">
          {logs.length} نشاط
        </span>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full bg-[#161625] rounded-lg" />
          ))
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">لا توجد سجلات حالياً</div>
        ) : (
          logs.map((log) => (
            <Card
              key={log.id}
              className="bg-[#161625] border-none hover:bg-[#1c1c2d] transition-all group rounded-lg overflow-hidden"
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-start gap-3 mr-11">
                 

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 text-xs">
                      <Badge
                        className={cn(
                          "px-2 py-0.5 rounded-md text-xs font-bold",
                          log.action === "delete"
                            ? "bg-red-500/20 text-red-500"
                            : "bg-green-500/20 text-green-500"
                        )}
                      >
                        {log.action === "create"
                          ? "إنشاء +"
                          : log.action === "delete"
                          ? "حذف"
                          : "تعديل"}
                      </Badge>
                      <span className="text-gray-400 text-xs">#{log.id}</span>
                      <span className="text-gold text-xs font-medium">
                        {log.entityType === "client"
                          ? "عميل"
                          : log.entityType === "case"
                          ? "قضية"
                          : "مستند"}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white">
                      {log.description || `تمت عملية ${log.action} على ${log.entityType}`}
                    </h3>

                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatDateTime(log.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>{log.userName || "مستخدم غير معروف"}</span>
                      </div>
                    </div>
                  </div>
                </div>
                 <button
      onClick={() => handleDelete(log.id)}
      disabled={deleteMutation.isPending}
      className="p-2 rounded-lg  hover:bg-red-500/10 hover:text-white transition-colors ml-4"
    >
      <Trash2 className="w-4 h-4" />
    </button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  </div>
</DashboardLayout>
  );
}
