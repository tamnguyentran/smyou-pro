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
import { useBusinessSales, type BusinessSales, type Metric } from "../api";
import { formatDecimal, formatPercent, periodLabel, shortMoney } from "../format";
import { useCardRange, type CardPeriod } from "./cardPeriod";
import {
  AXIS_TICK,
  COLOR,
  ChartCard,
  ChartEmpty,
  ChartFrame,
  ChartLegend,
  TabQuery,
  isFailed,
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

/** AC-RPT-128…130: tab "Bán hàng & sản phẩm" — each card its own period (M25-01: last 3 months,
 * Q181) and `GET .../sales?metric=…`; the top lists ignore `metric`, so they ask for revenue. */
export function SalesTab() {
  const [metric, setMetric] = useState<Metric>("revenue");
  const pareto = useCardRange(3);
  const top = useCardRange(3);
  const slow = useCardRange(3);
  const queries = [
    useBusinessSales(pareto.period, metric),
    useBusinessSales(top.period, "revenue"),
    useBusinessSales(slow.period, "revenue"),
  ] as const;
  return (
    <TabQuery queries={[...queries]}>
      <ParetoCard
        data={queries[0].data}
        failed={isFailed(queries[0])}
        picker={pareto}
        metric={metric}
        onMetric={setMetric}
      />
      <QuantityCard
        title="Top bán chạy"
        items={queries[1].data?.top_selling}
        failed={isFailed(queries[1])}
        picker={top}
      />
      <QuantityCard
        title="Top bán chậm"
        items={queries[2].data?.slow_selling}
        failed={isFailed(queries[2])}
        picker={slow}
      />
    </TabQuery>
  );
}

function ParetoCard({
  data,
  failed,
  picker,
  metric,
  onMetric,
}: {
  data?: BusinessSales;
  failed: boolean;
  picker: CardPeriod;
  metric: Metric;
  onMetric: (metric: Metric) => void;
}) {
  const { period } = picker;
  const metricWord = metric === "revenue" ? "doanh thu" : "lợi nhuận";
  return (
    <ChartCard
      title="Phân tích Pareto 80/20"
      className="lg:col-span-2"
      loading={!data}
      failed={failed}
      invalid={!period.valid}
      period={picker.controls}
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
                stroke={COLOR.axisLine}
                dataKey="label"
                tick={<TruncatedTick max={12} anchor="middle" />}
                interval={0}
                height={30}
              />
              <YAxis
                stroke={COLOR.axisLine}
                yAxisId="value"
                tick={AXIS_TICK}
                tickFormatter={shortMoney}
                width={48}
              />
              <YAxis
                stroke={COLOR.axisLine}
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
                dot={{ fill: COLOR.surface, stroke: COLOR.profit, strokeWidth: 2 }}
                activeDot={{ fill: COLOR.profit, stroke: COLOR.surface }}
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
                cursor={{ fill: COLOR.cursor, stroke: COLOR.cursor }}
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

function QuantityCard({
  title,
  items,
  failed,
  picker,
}: {
  title: string;
  items?: Item[];
  failed: boolean;
  picker: CardPeriod;
}) {
  const { period } = picker;
  const rows = (items ?? []).map((item) => ({
    ...item,
    shown: `${formatDecimal(item.quantity)} ${unitLabel(item.unit)}`,
  }));
  return (
    <ChartCard
      title={title}
      loading={!items}
      failed={failed}
      invalid={!period.valid}
      period={picker.controls}
    >
      {rows.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ChartFrame label={`${title} theo số lượng, ${periodLabel(period)}`}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
          >
            <XAxis stroke={COLOR.axisLine} type="number" hide allowDecimals={false} />
            <YAxis
              stroke={COLOR.axisLine}
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
              cursor={{ fill: COLOR.cursor, stroke: COLOR.cursor }}
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
