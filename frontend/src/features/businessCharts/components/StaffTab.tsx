import { Bar, BarChart, LabelList, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "../../../lib/format";
import { monthLabel } from "../../kpiTargets/month";
import { useBusinessStaff, type BusinessStaff } from "../api";
import { formatDecimal, formatPercent } from "../format";
import { useCardMonth, type CardPeriod } from "./cardPeriod";
import {
  COLOR,
  ChartCard,
  ChartEmpty,
  ChartFrame,
  TabQuery,
  isFailed,
  TooltipBox,
  TruncatedTick,
} from "./chartKit";

/** AC-RPT-131: tab "Nhân sự & KPI" — each card picks one month (M25-01) for `GET .../staff`. */
export function StaffTab() {
  const hours = useCardMonth();
  const kpi = useCardMonth();
  const queries = [useBusinessStaff(hours.period), useBusinessStaff(kpi.period)] as const;
  return (
    <TabQuery queries={[...queries]}>
      <HoursCard data={queries[0].data} failed={isFailed(queries[0])} picker={hours} />
      <KpiCard data={queries[1].data} failed={isFailed(queries[1])} picker={kpi} />
    </TabQuery>
  );
}

interface CardProps {
  data?: BusinessStaff;
  failed: boolean;
  picker: CardPeriod;
}

function hoursLabel(hours: number): string {
  return `${formatDecimal(hours)} giờ`;
}

function HoursCard({ data, failed, picker }: CardProps) {
  const { period } = picker;
  const rows = (data?.hours_by_technician ?? []).map((row) => ({
    ...row,
    shown: hoursLabel(row.assigned_hours),
  }));
  const title = "Giờ được phân công theo kỹ thuật viên";
  return (
    <ChartCard
      title={title}
      loading={!data}
      failed={failed}
      invalid={!period.valid}
      period={picker.controls}
    >
      {rows.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ChartFrame label={`${title}, tháng ${monthLabel(period.from)}`}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
          >
            <XAxis stroke={COLOR.axisLine} type="number" hide />
            <YAxis
              stroke={COLOR.axisLine}
              type="category"
              dataKey="employee_name"
              width={150}
              interval={0}
              tick={<TruncatedTick />}
            />
            <Bar
              dataKey="assigned_hours"
              fill={COLOR.newCustomers}
              isAnimationActive={false}
              maxBarSize={28}
            >
              <LabelList dataKey="shown" position="right" fill={COLOR.axis} fontSize={12} />
            </Bar>
            <Tooltip
              cursor={{ fill: COLOR.cursor, stroke: COLOR.cursor }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = payload[0]?.payload as (typeof rows)[number] | undefined;
                return active && row ? (
                  <TooltipBox
                    title={row.employee_name}
                    lines={[row.shown, `${String(row.task_count)} đầu việc`]}
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

function KpiCard({ data, failed, picker }: CardProps) {
  const { period } = picker;
  // M23a: KPI is for the period's last month.
  const { month, rows } = data?.kpi_completion ?? { month: period.to, rows: [] };
  const charted = rows.flatMap((row) =>
    row.achievement_pct === null
      ? []
      : [
          {
            ...row,
            pct: row.achievement_pct,
            shown: formatPercent(row.achievement_pct),
            fill: row.achievement_pct >= 100 ? COLOR.profit : COLOR.revenue,
          },
        ],
  );
  return (
    <ChartCard
      title={`Tỷ lệ hoàn thành KPI theo nhân viên — ${monthLabel(month)}`}
      loading={!data}
      failed={failed}
      invalid={!period.valid}
      period={picker.controls}
    >
      {rows.length === 0 ? (
        <ChartEmpty />
      ) : (
        <>
          {charted.length === 0 ? (
            <ChartEmpty />
          ) : (
            <ChartFrame label={`Tỷ lệ hoàn thành KPI theo nhân viên, tháng ${monthLabel(month)}`}>
              <BarChart
                data={charted}
                layout="vertical"
                margin={{ top: 16, right: 64, bottom: 4, left: 0 }}
              >
                <XAxis
                  stroke={COLOR.axisLine}
                  type="number"
                  hide
                  domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]}
                />
                <YAxis
                  stroke={COLOR.axisLine}
                  type="category"
                  dataKey="employee_name"
                  width={150}
                  interval={0}
                  tick={<TruncatedTick />}
                />
                <Bar dataKey="pct" isAnimationActive={false} maxBarSize={28}>
                  <LabelList dataKey="shown" position="right" fill={COLOR.axis} fontSize={12} />
                </Bar>
                <ReferenceLine
                  x={100}
                  stroke={COLOR.danger}
                  strokeDasharray="4 4"
                  label={{ value: "100%", position: "top", fill: COLOR.danger, fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: COLOR.cursor, stroke: COLOR.cursor }}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const row = payload[0]?.payload as (typeof charted)[number] | undefined;
                    return active && row ? (
                      <TooltipBox title={row.employee_name} lines={[`Tỷ lệ đạt: ${row.shown}`]} />
                    ) : null;
                  }}
                />
              </BarChart>
            </ChartFrame>
          )}
          <KpiTable rows={rows} />
        </>
      )}
    </ChartCard>
  );
}

function money(value: number | null): string {
  return value === null ? "—" : formatCurrency(value);
}

function KpiTable({ rows }: { rows: BusinessStaff["kpi_completion"]["rows"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-2 pr-3 font-semibold">Nhân viên</th>
            <th className="py-2 pr-3 text-right font-semibold">Thuần</th>
            <th className="py-2 pr-3 text-right font-semibold">Mục tiêu</th>
            <th className="py-2 text-right font-semibold">Tỷ lệ đạt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employee_id} className="border-b border-line last:border-0">
              <td className="py-2 pr-3 text-heading">{row.employee_name}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{money(row.net_revenue)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{money(row.target)}</td>
              <td className="py-2 text-right tabular-nums">
                {row.achievement_pct === null ? "—" : formatPercent(row.achievement_pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
