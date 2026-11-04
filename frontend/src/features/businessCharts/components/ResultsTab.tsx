import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChipGroup } from "../../../components/ui/Chip";
import { formatCurrency } from "../../../lib/format";
import { useBusinessResults, type BusinessResults, type Metric, type Period } from "../api";
import { formatPercent, monthTick, periodLabel, shortMoney } from "../format";
import {
  AXIS_TICK,
  COLOR,
  ChartCard,
  ChartEmpty,
  ChartFrame,
  ChartLegend,
  SERIES,
  TabQuery,
  TooltipBox,
} from "./chartKit";

type Dimension = "by_group" | "by_item" | "by_customer_type";

const METRICS = [
  { value: "revenue", label: "Doanh thu" },
  { value: "profit", label: "Lợi nhuận" },
] as const;

const DIMENSIONS = [
  { value: "by_group", label: "Nhóm SP/DV" },
  { value: "by_item", label: "Sản phẩm – Dịch vụ" },
  { value: "by_customer_type", label: "Loại khách hàng" },
] as const;

const DIMENSION_LABEL: Record<Dimension, string> = {
  by_group: "nhóm SP/DV",
  by_item: "sản phẩm – dịch vụ",
  by_customer_type: "loại khách hàng",
};

/** AC-RPT-125…127: tab "Kết quả kinh doanh" — one `GET .../results`. */
export function ResultsTab({ period }: { period: Period }) {
  const query = useBusinessResults(period);
  return (
    <TabQuery query={query}>
      {(data) => (
        <>
          <MonthlyCard data={data} period={period} />
          <CompositionCard data={data} period={period} />
          <CustomersCard data={data} period={period} />
        </>
      )}
    </TabQuery>
  );
}

function MonthlyCard({ data, period }: { data?: BusinessResults; period: Period }) {
  const rows = (data?.monthly ?? []).map((m) => ({ ...m, tick: monthTick(m.month) }));
  return (
    <ChartCard title="Doanh thu & Lợi nhuận theo tháng" className="lg:col-span-2" loading={!data}>
      <ChartFrame label={`Doanh thu và lợi nhuận theo tháng, ${periodLabel(period)}`}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={COLOR.grid} vertical={false} />
          <XAxis dataKey="tick" tick={AXIS_TICK} />
          <YAxis tick={AXIS_TICK} tickFormatter={shortMoney} width={56} />
          <Bar dataKey="revenue" name="Doanh thu" fill={COLOR.revenue} isAnimationActive={false} />
          <Line
            dataKey="profit"
            name="Lợi nhuận"
            stroke={COLOR.profit}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number; value?: number }) => (
              <circle
                key={props.index}
                cx={props.cx}
                cy={props.cy}
                r={3}
                fill={(props.value ?? 0) < 0 ? COLOR.danger : COLOR.profit}
              />
            )}
          />
          <Tooltip
            isAnimationActive={false}
            content={({ active, payload, label }) =>
              active && payload.length ? (
                <TooltipBox
                  title={String(label)}
                  lines={payload.map(
                    (p) => `${String(p.name)}: ${formatCurrency(Number(p.value))}`,
                  )}
                />
              ) : null
            }
          />
        </ComposedChart>
      </ChartFrame>
      <ChartLegend
        items={[
          { label: "Doanh thu", color: COLOR.revenue },
          { label: "Lợi nhuận", color: COLOR.profit },
        ]}
      />
    </ChartCard>
  );
}

function CompositionCard({ data, period }: { data?: BusinessResults; period: Period }) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const [dimension, setDimension] = useState<Dimension>("by_group");
  // A pie cannot draw a loss: shares are of the positive slices only.
  const slices = (data?.composition[dimension] ?? [])
    .map((share) => ({ key: share.key, label: share.label, value: share[metric] }))
    .filter((slice) => slice.value > 0)
    // Recharts reads each datum's `fill` (Cell is deprecated in 3.x).
    .map((slice, i) => ({ ...slice, fill: SERIES[i % SERIES.length] ?? COLOR.minor }));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const metricWord = metric === "revenue" ? "doanh thu" : "lợi nhuận";
  const share = (value: number) => formatPercent((value / total) * 100);

  return (
    <ChartCard
      title={`Cơ cấu ${metricWord}`}
      loading={!data}
      controls={
        <>
          <ChipGroup label="Chỉ số" value={metric} options={METRICS} onChange={setMetric} />
          <ChipGroup label="Theo" value={dimension} options={DIMENSIONS} onChange={setDimension} />
        </>
      }
    >
      {slices.length === 0 ? (
        <ChartEmpty />
      ) : (
        <>
          <ChartFrame
            label={`Cơ cấu ${metricWord} theo ${DIMENSION_LABEL[dimension]}, ${periodLabel(period)}`}
          >
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius="45%"
                outerRadius="85%"
                isAnimationActive={false}
              />
              <Tooltip
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const item = payload[0];
                  return active && item ? (
                    <TooltipBox
                      title={String(item.name)}
                      lines={[
                        `${formatCurrency(Number(item.value))} · ${share(Number(item.value))}`,
                      ]}
                    />
                  ) : null;
                }}
              />
            </PieChart>
          </ChartFrame>
          <ChartLegend
            items={slices.map((slice) => ({
              label: slice.label,
              color: slice.fill,
              note: share(slice.value),
            }))}
          />
        </>
      )}
    </ChartCard>
  );
}

function CustomersCard({ data, period }: { data?: BusinessResults; period: Period }) {
  const rows = (data?.customers_monthly ?? []).map((m) => ({ ...m, tick: monthTick(m.month) }));
  return (
    <ChartCard title="Khách hàng mới & quay lại" loading={!data}>
      <ChartFrame label={`Khách hàng mới và quay lại theo tháng, ${periodLabel(period)}`}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={COLOR.grid} vertical={false} />
          <XAxis dataKey="tick" tick={AXIS_TICK} />
          <YAxis tick={AXIS_TICK} allowDecimals={false} width={40} />
          <Bar
            dataKey="new_count"
            name="Khách mới"
            fill={COLOR.newCustomers}
            isAnimationActive={false}
          />
          <Bar
            dataKey="returning_count"
            name="Khách quay lại"
            fill={COLOR.returningCustomers}
            isAnimationActive={false}
          />
          <Tooltip
            isAnimationActive={false}
            content={({ active, payload, label }) =>
              active && payload.length ? (
                <TooltipBox
                  title={String(label)}
                  lines={payload.map((p) => `${String(p.name)}: ${String(p.value)} khách`)}
                />
              ) : null
            }
          />
        </BarChart>
      </ChartFrame>
      <ChartLegend
        items={[
          { label: "Khách mới", color: COLOR.newCustomers },
          { label: "Khách quay lại", color: COLOR.returningCustomers },
        ]}
      />
    </ChartCard>
  );
}
