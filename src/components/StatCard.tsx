import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: "rood" | "geel" | "blauw" | "groen";
  to?: string;
}

const colorMap = {
  rood: "bg-kanjer-rood/10 text-kanjer-rood",
  geel: "bg-kanjer-geel/10 text-kanjer-geel",
  blauw: "bg-kanjer-blauw/10 text-kanjer-blauw",
  groen: "bg-kanjer-groen/10 text-kanjer-groen",
};

export default function StatCard({ title, value, subtitle, icon, color, to }: StatCardProps) {
  const content = (
    <div className={cn("rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md", to && "cursor-pointer")}>
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

  if (to) {
    return <Link to={to}>{content}</Link>;
  }
  return content;
}
