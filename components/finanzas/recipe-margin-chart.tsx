"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

export interface RecipeMarginDatum {
  name: string;
  marginPct: number;
}

interface RecipeMarginChartProps {
  data: RecipeMarginDatum[];
  isLoading: boolean;
}

const marginChartConfig = {
  marginPct: { label: "Margen", color: "var(--color-chart-1)" },
};

/**
 * finanzas-gastos-recetas PR3. Margin-by-product bar chart for the Recetas
 * tab, reusing the same components/ui/chart wrappers (ChartContainer/
 * ChartTooltip) already used at app/(dashboard)/rendimiento/page.tsx — no
 * new deps, same pattern. `data` is derived by the caller (recetas-tab.tsx)
 * from the SAME computeMargin call that feeds the table, so this chart can
 * never disagree with the table's numbers.
 */
export function RecipeMarginChart({ data, isLoading }: RecipeMarginChartProps) {
  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Margen por producto</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-75 w-full" />
        ) : data.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No hay datos de margen para mostrar todavía
          </p>
        ) : (
          <ChartContainer config={marginChartConfig} className="h-75 w-full">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(v) => [`${v}%`, " - Margen"]}
                  />
                }
              />
              <Bar
                dataKey="marginPct"
                fill="var(--color-chart-1)"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
