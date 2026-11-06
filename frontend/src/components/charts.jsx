import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { inr } from '../api'
import { Empty } from './ui'

// Brand palette for charts
export const PALETTE = ['#073B70', '#E8B75C', '#3A86D1', '#2E9E5B', '#8FB0D4', '#D98E04', '#BFE8FA']
const axis = { fontSize: 11.5, fill: '#5B6B7C' }
const tipStyle = { borderRadius: 12, border: '1px solid #E6E0D3', boxShadow: '0 8px 24px rgba(7,59,112,.12)', fontSize: 13 }
const fmtNum = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : v)

export function AreaTrend({ data, x = 'label', y = 'value', money = true, height = 280 }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="skyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#BFE8FA" stopOpacity={0.9} /><stop offset="100%" stopColor="#BFE8FA" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#EEF2F5" vertical={false} />
          <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={44} />
          <Tooltip contentStyle={tipStyle} formatter={(v) => [money ? inr(v) : v, 'Revenue']} />
          <Area type="monotone" dataKey={y} stroke="#073B70" strokeWidth={2.2} fill="url(#skyFill)" animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** series: [{ key, name, color }] */
export function Bars({ data, x = 'label', series, stacked = false, money = false, height = 280, legend }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#EEF2F5" vertical={false} />
          <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={44} allowDecimals={!stacked || !money} />
          <Tooltip contentStyle={tipStyle} cursor={{ fill: 'rgba(191,232,250,.25)' }} formatter={(v, n) => [money ? inr(v) : v, n]} />
          {(legend ?? series.length > 1) && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name || s.key} stackId={stacked ? 'a' : undefined}
              fill={s.color || PALETTE[i % PALETTE.length]} radius={stacked && i < series.length - 1 ? 0 : [6, 6, 0, 0]} maxBarSize={42} animationDuration={800} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** data: { name: value } */
export function Donut({ data, money = false, height = 250 }) {
  const rows = Object.entries(data || {}).map(([name, value]) => ({ name, value }))
  if (!rows.length || rows.every((r) => !r.value)) return <Empty icon="chart" title="No data yet" />
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none" animationDuration={900}>
            {rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip contentStyle={tipStyle} formatter={(v) => (money ? inr(v) : v)} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
