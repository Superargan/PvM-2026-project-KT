import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: "rood" | "geel" | "blauw" | "groen";
}

const colorMap = {
  rood: "bg-kanjer-rood/10 text-kanjer-rood",
  geel: "bg-kanjer-geel/10 text-kanjer-geel",
  blauw: "bg-kanjer-blauw/10 text-kanjer-blauw",
  groen: "bg-kanjer-groen/10 text-kanjer-groen",
};

export default function StatCard({ title, value, subtitle, icon, color }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-card-foreground">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", colorMap[color])}>
          {icon}
        </div>
      </div>
    </div>
  );
}
