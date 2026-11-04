import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChipGroup } from "../../../components/ui/Chip";
import { formatCurrency } from "../../../lib/format";
import { UNIT_LABELS as PRODUCT_UNITS } from "../../products/schemas";
import { UNIT_LABELS as SERVICE_UNITS } from "../../services/schemas";
import { useBusinessSales, type BusinessSales, type Metric, type Period } from "../api";
import { formatDecimal, formatPercent, periodLabel, shortMoney } from "../format";
import {
  AXIS_TICK,
  COLOR,
  ChartCard,
  ChartEmpty,
  ChartFrame,
  ChartLegend,
  TabQuery,
  TooltipBox,
  TruncatedTick,
} from "./chartKit";

const METRICS = [
  { value: "revenue", label: "Doanh thu" },
  { value: "profit", label: "Lợi nhuận" },
] as const;

type Item = BusinessSales["top_selling"][number];

function unitLabel(unit: string): string {
  // Lines mix products and services: their unit codes come from both catalogs.
  const labels: Record<string, string | undefined> = { ...PRODUCT_UNITS, ...SERVICE_UNITS };
  return labels[unit] ?? unit;
}

/** AC-RPT-128…130: tab "Bán hàng & sản phẩm" — one `GET .../sales?metric=…` per metric. */
export function SalesTab({ period }: { period: Period }) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const query = useBusinessSales(period, metric);
  return (
    <TabQuery query={query}>
      {(data) => (
        <>
          <ParetoCard data={data} period={period} metric={metric} onMetric={setMetric} />
          <QuantityCard title="Top bán chạy" items={data?.top_selling} period={period} />
          <QuantityCard title="Top bán chậm" items={data?.slow_selling} period={period} />
        </>
      )}
    </TabQuery>
  );
}

function ParetoCard({
  data,
  period,
  metric,
  onMetric,
}: {
  data?: BusinessSales;
  period: Period;
  metric: Metric;
  onMetric: (metric: Metric) => void;
}) {
  const metricWord = metric === "revenue" ? "doanh thu" : "lợi nhuận";
  return (
    <ChartCard
      title="Phân tích Pareto 80/20"
      className="lg:col-span-2"
      loading={!data}
      controls={<ChipGroup label="Chỉ số" value={metric} options={METRICS} onChange={onMetric} />}
    >
      {!data || data.pareto.length === 0 ? (
        <ChartEmpty />
      ) : (
        <>
          <ChartFrame
            label={`Pareto ${metricWord} theo sản phẩm – dịch vụ, ${periodLabel(period)}`}
          >
            <ComposedChart
              data={data.pareto.map((item) => ({
                ...item,
                fill: item.is_vital ? COLOR.revenue : COLOR.minor,
              }))}
              margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
            >
              <CartesianGrid stroke={COLOR.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={<TruncatedTick max={12} anchor="middle" />}
                interval={0}
                height={30}
              />
              <YAxis yAxisId="value" tick={AXIS_TICK} tickFormatter={shortMoney} width={48} />
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={AXIS_TICK}
                tickFormatter={(v: number) => `${String(v)}%`}
                width={40}
              />
              <Bar
                yAxisId="value"
                dataKey="value"
                name={metricWord}
                isAnimationActive={false}
                maxBarSize={64}
              />
              <Line
                yAxisId="pct"
                dataKey="cumulative_pct"
                stroke={COLOR.profit}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <ReferenceLine
                yAxisId="pct"
                y={80}
                stroke={COLOR.danger}
                strokeDasharray="4 4"
                label={{
                  value: "80%",
                  position: "insideTopRight",
                  fill: COLOR.danger,
                  fontSize: 12,
                }}
              />
              <Tooltip
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const item = payload[0]?.payload as BusinessSales["pareto"][number] | undefined;
                  return active && item ? (
                    <TooltipBox
                      title={item.label}
                      lines={[
                        `${metric === "revenue" ? "Doanh thu" : "Lợi nhuận"}: ${formatCurrency(item.value)}`,
                        `Luỹ kế: ${formatPercent(item.cumulative_pct)}`,
                      ]}
                    />
                  ) : null;
                }}
              />
            </ComposedChart>
          </ChartFrame>
          <ChartLegend
            items={[
              { label: "Nhóm chiếm 80%", color: COLOR.revenue },
              { label: "Còn lại", color: COLOR.minor },
              { label: "% luỹ kế", color: COLOR.profit },
            ]}
          />
        </>
      )}
    </ChartCard>
  );
}

function QuantityCard({ title, items, period }: { title: string; items?: Item[]; period: Period }) {
  const rows = (items ?? []).map((item) => ({
    ...item,
    shown: `${formatDecimal(item.quantity)} ${unitLabel(item.unit)}`,
  }));
  return (
    <ChartCard title={title} loading={!items}>
      {rows.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ChartFrame label={`${title} theo số lượng, ${periodLabel(period)}`}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
          >
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              interval={0}
              tick={<TruncatedTick />}
            />
            <Bar
              dataKey="quantity"
              fill={COLOR.revenue}
              isAnimationActive={false}
              minPointSize={2}
              maxBarSize={28}
            >
              <LabelList dataKey="shown" position="right" fill={COLOR.axis} fontSize={12} />
            </Bar>
            <Tooltip
              isAnimationActive={false}
              content={({ active, payload }) => {
                const item = payload[0]?.payload as (typeof rows)[number] | undefined;
                return active && item ? (
                  <TooltipBox
                    title={item.label}
                    lines={[
                      `Số lượng: ${item.shown}`,
                      `Doanh thu: ${formatCurrency(item.revenue)}`,
                    ]}
                  />
                ) : null;
              }}
            />
          </BarChart>
        </ChartFrame>
      )}
    </ChartCard>
  );
}
