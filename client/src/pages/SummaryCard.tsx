import { Card } from "@/components/ui/card";

export default function SummaryCard({
  title,
  value,
  icon: Icon,
  change,
}: any) {
  return (
    <Card className="p-4 flex items-center justify-between bg-secondary/30 border-border/50">
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>

        <h2 className="text-2xl font-bold text-foreground mt-1">
          {value}
        </h2>

        {change && (
          <p className="text-xs text-green-400 mt-1">
            {change}
          </p>
        )}
      </div>

      <div className="p-3 bg-gold/10 rounded-lg">
        <Icon className="h-5 w-5 text-gold" />
      </div>
    </Card>
  );
}