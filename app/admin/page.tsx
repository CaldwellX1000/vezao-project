'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'

type Report = {
  id: string
  reporter_id: string
  reported_user_id: string
  video_id: string | null
  reason: string
  video_url: string | null
  status: string | null
  created_at: string
  reporter?: { username: string | null; full_name: string | null } | null
  reported?: { username: string | null; full_name: string | null } | null
}

type BannedUser = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

type Stats = {
  users: number
  videos: number
  openReports: number
  totalReports: number
  resolvedReports: number
  bannedUsers: number
  totalViews: number
  newUsers7d: number
}

type Tab = 'overview' | 'reports' | 'banned'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  })
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<Stats>({
    users: 0,
    videos: 0,
    openReports: 0,
    totalReports: 0,
    resolvedReports: 0,
    bannedUsers: 0,
    totalViews: 0,
    newUsers7d: 0,
  })
  const [newReportToast, setNewReportToast] = useState<string | null>(null)
  const [newUsersByDay, setNewUsersByDay] = useState<{ label: string; count: number }[]>([])
  const [reportRange, setReportRange] = useState<'1d' | '7d' | '30d' | '1y'>('7d')
  const [userRange, setUserRange] = useState<'1d' | '7d' | '30d' | '1y'>('7d')
  const [allUsersCreated, setAllUsersCreated] = useState<string[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [allReports, setAllReports] = useState<Report[]>([])
  const [banned, setBanned] = useState<BannedUser[]>([])
  const [filter, setFilter] = useState<'open' | 'all' | 'resolved'>('open')
  const [acting, setActing] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  const reasonStats = useMemo(() => {
    const map = new Map<string, number>()
    allReports.forEach((r) => {
      const key = r.reason || 'Lainnya'
      map.set(key, (map.get(key) || 0) + 1)
    })
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [allReports])

  const maxReason = Math.max(...reasonStats.map(([, n]) => n), 1)

  const reportChart = useMemo(() => {
    const buckets: { label: string; count: number; start: number; end: number }[] = []
    const now = new Date()

    if (reportRange === '1d') {
      // 24 jam, per 3 jam
      for (let i = 7; i >= 0; i--) {
        const end = new Date(now)
        end.setMinutes(0, 0, 0)
        end.setHours(end.getHours() - i * 3)
        const start = new Date(end)
        start.setHours(start.getHours() - 3)
        buckets.push({
          label: start.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          count: 0,
          start: start.getTime(),
          end: end.getTime(),
        })
      }
    } else if (reportRange === '7d') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now)
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() - i)
        const next = new Date(d)
        next.setDate(next.getDate() + 1)
        buckets.push({
          label: d.toLocaleDateString('id-ID', { weekday: 'short' }),
          count: 0,
          start: d.getTime(),
          end: next.getTime(),
        })
      }
    } else if (reportRange === '30d') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now)
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() - i)
        const next = new Date(d)
        next.setDate(next.getDate() + 1)
        buckets.push({
          label: String(d.getDate()),
          count: 0,
          start: d.getTime(),
          end: next.getTime(),
        })
      }
    } else {
      // 1 tahun, per bulan
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
        buckets.push({
          label: d.toLocaleDateString('id-ID', { month: 'short' }),
          count: 0,
          start: d.getTime(),
          end: next.getTime(),
        })
      }
    }

    allReports.forEach((r) => {
      const t = new Date(r.created_at).getTime()
      const b = buckets.find((x) => t >= x.start && t < x.end)
      if (b) b.count += 1
    })

    return buckets.map(({ label, count }) => ({ label, count }))
  }, [allReports, reportRange])

  const maxDay = Math.max(...reportChart.map((d) => d.count), 1)
  const rangeTotal = reportChart.reduce((s, d) => s + d.count, 0)

  const userChart = useMemo(() => {
    const buckets: { label: string; count: number; start: number; end: number }[] = []
    const now = new Date()

    if (userRange === '1d') {
      for (let i = 7; i >= 0; i--) {
        const end = new Date(now)
        end.setMinutes(0, 0, 0)
        end.setHours(end.getHours() - i * 3)
        const start = new Date(end)
        start.setHours(start.getHours() - 3)
        buckets.push({
          label: start.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          count: 0,
          start: start.getTime(),
          end: end.getTime(),
        })
      }
    } else if (userRange === '7d') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now)
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() - i)
        const next = new Date(d)
        next.setDate(next.getDate() + 1)
        buckets.push({
          label: d.toLocaleDateString('id-ID', { weekday: 'short' }),
          count: 0,
          start: d.getTime(),
          end: next.getTime(),
        })
      }
    } else if (userRange === '30d') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now)
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() - i)
        const next = new Date(d)
        next.setDate(next.getDate() + 1)
        buckets.push({
          label: String(d.getDate()),
          count: 0,
          start: d.getTime(),
          end: next.getTime(),
        })
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
        buckets.push({
          label: d.toLocaleDateString('id-ID', { month: 'short' }),
          count: 0,
          start: d.getTime(),
          end: next.getTime(),
        })
      }
    }

    allUsersCreated.forEach((c) => {
      const t = new Date(c).getTime()
      const b = buckets.find((x) => t >= x.start && t < x.end)
      if (b) b.count += 1
    })

    return buckets.map(({ label, count }) => ({ label, count }))
  }, [allUsersCreated, userRange])

  const maxUserDay = Math.max(...userChart.map((d) => d.count), 1)
  const userRangeTotal = userChart.reduce((s, d) => s + d.count, 0)

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      setForbidden(true)
      setLoading(false)
      return
    }

    const [
      { count: users },
      { count: videos },
      { count: openReports },
      { count: totalReports },
      { count: resolvedReports },
      { count: bannedUsers },
      { data: bannedRows },
      { data: allRows },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('videos').select('*', { count: 'exact', head: true }).eq('is_draft', false),
      supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .or('status.eq.open,status.is.null'),
      supabase.from('reports').select('*', { count: 'exact', head: true }),
      supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved'),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_banned', true),
      supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .eq('is_banned', true)
        .order('username'),
      supabase
        .from('reports')
        .select(
          'id, reporter_id, reported_user_id, video_id, reason, video_url, status, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(200),
    ])

        // Total views
    const { data: viewRows } = await supabase
      .from('videos')
      .select('views_count')
      .eq('is_draft', false)

    const totalViews = (viewRows || []).reduce(
      (sum, v) => sum + (Number(v.views_count) || 0),
      0
    )

    // User created_at (1 tahun ke belakang, untuk filter chart)
    const sinceYear = new Date()
    sinceYear.setFullYear(sinceYear.getFullYear() - 1)

    const { data: recentUsers } = await supabase
      .from('profiles')
      .select('created_at')
      .gte('created_at', sinceYear.toISOString())
      .limit(5000)

    const createdList = (recentUsers || [])
      .map((u) => u.created_at)
      .filter(Boolean) as string[]
    setAllUsersCreated(createdList)

    const since7 = new Date()
    since7.setDate(since7.getDate() - 7)
    const newUsers7d = createdList.filter(
      (c) => new Date(c).getTime() >= since7.getTime()
    ).length

    setStats({
      users: users || 0,
      videos: videos || 0,
      openReports: openReports || 0,
      totalReports: totalReports || 0,
      resolvedReports: resolvedReports || 0,
      bannedUsers: bannedUsers || 0,
      totalViews,
      newUsers7d,
    })
    setBanned(bannedRows || [])

    const list = allRows || []
    setAllReports(list)

    const ids = new Set<string>()
    list.forEach((r) => {
      ids.add(r.reporter_id)
      ids.add(r.reported_user_id)
    })

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .in('id', Array.from(ids))

    const map = new Map((profiles || []).map((p) => [p.id, p]))
    const enriched = list.map((r) => ({
      ...r,
      reporter: map.get(r.reporter_id) || null,
      reported: map.get(r.reported_user_id) || null,
    }))

    setAllReports(enriched)

    let filtered = enriched
    if (filter === 'open') {
      filtered = enriched.filter((r) => r.status !== 'resolved')
    } else if (filter === 'resolved') {
      filtered = enriched.filter((r) => r.status === 'resolved')
    }
    setReports(filtered)
    setLoading(false)
  }, [filter, router, supabase])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Notifikasi report baru (realtime)
  useEffect(() => {
    const channel = supabase
      .channel('admin-reports')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reports' },
        (payload) => {
          const reason = (payload.new as any)?.reason || 'Report baru'
          setNewReportToast(reason)
          setStats((s) => ({
            ...s,
            openReports: s.openReports + 1,
            totalReports: s.totalReports + 1,
          }))
          // refresh list
          load()
          if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'granted') {
              new Notification('VEZAO Admin', {
                body: `Report baru: ${reason}`,
              })
            }
          }
          setTimeout(() => setNewReportToast(null), 6000)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [load, supabase])

  const resolveReport = async (id: string) => {
    setActing(id)
    const { error } = await supabase
      .from('reports')
      .update({ status: 'resolved' })
      .eq('id', id)
    setActing(null)
    if (error) {
      toast('Gagal: ' + error.message, 'error')
      return
    }
    await load()
  }

  const deleteVideo = async (report: Report) => {
    if (!report.video_id) {
      toast('Report ini tidak punya video_id', 'error')
      return
    }
    if (!confirm('Hapus video ini dari platform?')) return
    setActing(report.id)
    const { error } = await supabase.from('videos').delete().eq('id', report.video_id)
    if (error) {
      toast('Gagal hapus video: ' + error.message, 'error')
      setActing(null)
      return
    }
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', report.id)
    setActing(null)
    await load()
  }

  const banUser = async (report: Report) => {
    const uname = report.reported?.username || report.reported_user_id.slice(0, 8)
    if (!confirm(`Ban @${uname}? Akun tidak bisa pakai VEZAO.`)) return
    setActing(report.id)
    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: true })
      .eq('id', report.reported_user_id)
    if (error) {
      toast('Gagal ban: ' + error.message, 'error')
      setActing(null)
      return
    }
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', report.id)
    setActing(null)
    toast(`@${uname} sudah di-ban`, 'success')
    await load()
  }

  const unbanUser = async (userId: string, username?: string | null) => {
    if (!confirm(`Buka ban @${username || userId.slice(0, 8)}?`)) return
    setActing(userId)
    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: false })
      .eq('id', userId)
    setActing(null)
    if (error) {
      toast('Gagal unban: ' + error.message, 'error')
      return
    }
    await load()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-lg font-semibold">Akses ditolak</p>
        <p className="text-sm text-gray-400 text-center">
          Akun ini bukan admin.
        </p>
        <button
          onClick={() => router.push('/')}
          className="mt-2 px-5 py-2 rounded-full bg-vezao-gradient text-sm font-medium"
        >
          Kembali
        </button>
      </div>
    )
  }

  const resolveRate =
    stats.totalReports > 0
      ? Math.round((stats.resolvedReports / stats.totalReports) * 100)
      : 0

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0b]/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"
            >
              ←
            </button>
            <div>
              <p className="text-sm font-semibold leading-tight">VEZAO Admin</p>
              <p className="text-[11px] text-gray-500">Moderation & analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              Live
            </span>
            <button
              onClick={() => {
                setLoading(true)
                load()
              }}
              className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1 pb-2">
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'reports', label: `Reports (${stats.openReports})` },
              { id: 'banned', label: `Banned (${stats.bannedUsers})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition ${
                tab === t.id
                  ? 'bg-vezao-gradient text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {newReportToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] max-w-sm w-[90%]">
          <div className="rounded-2xl border border-orange-500/30 bg-zinc-900 shadow-xl px-4 py-3 flex items-start gap-3">
            <span className="text-orange-400 text-lg leading-none mt-0.5">●</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Report baru masuk</p>
              <p className="text-xs text-gray-400 truncate">{newReportToast}</p>
            </div>
            <button
              onClick={() => {
                setNewReportToast(null)
                setTab('reports')
                setFilter('open')
              }}
              className="text-xs text-purple-400 shrink-0"
            >
              Lihat
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: 'Users', value: stats.users, hint: 'Total akun' },
            { label: 'Videos', value: stats.videos, hint: 'Published' },
            {
              label: 'Total views',
              value: stats.totalViews.toLocaleString('id-ID'),
              hint: 'Semua video',
            },
            {
              label: 'User 7 hari',
              value: stats.newUsers7d,
              hint: 'Pendaftar baru',
            },
            { label: 'Open reports', value: stats.openReports, hint: 'Perlu review' },
            { label: 'Resolved', value: stats.resolvedReports, hint: `${resolveRate}% rate` },
            { label: 'Total reports', value: stats.totalReports, hint: 'Semua waktu' },
            { label: 'Banned', value: stats.bannedUsers, hint: 'Akun diblokir' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-4"
            >
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold mt-1 tabular-nums">{s.value}</p>
              <p className="text-[11px] text-gray-500 mt-1">{s.hint}</p>
            </div>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Reports last 7 days */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <p className="font-semibold text-sm">Volume laporan</p>
                  <p className="text-[11px] text-gray-500">
                    Total periode: <span className="text-white font-medium">{rangeTotal}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { id: '1d', label: 'Hari ini' },
                      { id: '7d', label: '1 minggu' },
                      { id: '30d', label: '1 bulan' },
                      { id: '1y', label: '1 tahun' },
                    ] as const
                  ).map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setReportRange(r.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                        reportRange === r.id
                          ? 'bg-vezao-gradient border-transparent text-white'
                          : 'border-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className={`flex items-end h-36 ${
                  reportRange === '30d' ? 'gap-0.5' : 'gap-2'
                }`}
              >
                {reportChart.map((d, i) => (
                  <div
                    key={`${d.label}-${i}`}
                    className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end min-w-0"
                  >
                    <span className="text-[9px] text-gray-400 tabular-nums">{d.count}</span>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-purple-600 to-fuchsia-400 min-h-[4px]"
                      style={{ height: `${(d.count / maxDay) * 100}%` }}
                    />
                    <span
                      className={`text-gray-500 truncate w-full text-center ${
                        reportRange === '30d' ? 'text-[8px]' : 'text-[10px]'
                      }`}
                    >
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reason breakdown */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4">
                <p className="font-semibold text-sm">Alasan report terbanyak</p>
                <p className="text-[11px] text-gray-500">Berdasarkan semua laporan</p>
              </div>
              {reasonStats.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">Belum ada data</p>
              ) : (
                <div className="space-y-3">
                  {reasonStats.map(([reason, count]) => (
                    <div key={reason}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-300 truncate pr-2">{reason}</span>
                        <span className="text-gray-500 tabular-nums">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-vezao-gradient"
                          style={{ width: `${(count / maxReason) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* User baru — filter periode */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <p className="font-semibold text-sm">User baru</p>
                  <p className="text-[11px] text-gray-500">
                    Total periode:{' '}
                    <span className="text-white font-medium">{userRangeTotal}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { id: '1d', label: 'Hari ini' },
                      { id: '7d', label: '1 minggu' },
                      { id: '30d', label: '1 bulan' },
                      { id: '1y', label: '1 tahun' },
                    ] as const
                  ).map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setUserRange(r.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                        userRange === r.id
                          ? 'bg-gradient-to-r from-cyan-600 to-emerald-400 border-transparent text-white'
                          : 'border-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className={`flex items-end h-36 ${
                  userRange === '30d' ? 'gap-0.5' : 'gap-2'
                }`}
              >
                {userChart.map((d, i) => (
                  <div
                    key={`${d.label}-${i}`}
                    className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end min-w-0"
                  >
                    <span className="text-[9px] text-gray-400 tabular-nums">
                      {d.count}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-cyan-600 to-emerald-400 min-h-[4px]"
                      style={{ height: `${(d.count / maxUserDay) * 100}%` }}
                    />
                    <span
                      className={`text-gray-500 truncate w-full text-center ${
                        userRange === '30d' ? 'text-[8px]' : 'text-[10px]'
                      }`}
                    >
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* Recent open reports preview */}
            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-sm">Report terbuka terbaru</p>
                  <p className="text-[11px] text-gray-500">Butuh tindakan</p>
                </div>
                <button
                  onClick={() => setTab('reports')}
                  className="text-xs text-purple-400 hover:underline"
                >
                  Lihat semua →
                </button>
              </div>
              <div className="space-y-2">
                {allReports
                  .filter((r) => r.status !== 'resolved')
                  .slice(0, 5)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/5"
                    >
                      <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.reason}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                          @{r.reporter?.username} → @{r.reported?.username} ·{' '}
                          {formatShort(r.created_at)}
                        </p>
                      </div>
                      {r.video_id && (
                        <button
                          onClick={() => router.push(`/v/${r.video_id}`)}
                          className="text-[11px] text-purple-400 shrink-0"
                        >
                          Buka
                        </button>
                      )}
                    </div>
                  ))}
                {allReports.filter((r) => r.status !== 'resolved').length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-6">
                    Tidak ada report terbuka 🎉
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'reports' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(['open', 'resolved', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                    filter === f
                      ? 'bg-vezao-gradient border-transparent text-white'
                      : 'border-white/15 text-gray-400'
                  }`}
                >
                  {f === 'open' ? 'Open' : f === 'resolved' ? 'Selesai' : 'Semua'}
                </button>
              ))}
            </div>

            {reports.length === 0 ? (
              <div className="rounded-2xl border border-white/10 py-16 text-center text-sm text-gray-500">
                Tidak ada laporan
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-orange-300">{r.reason}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {formatDate(r.created_at)}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
                          r.status === 'resolved'
                            ? 'border-green-500/40 text-green-400'
                            : 'border-orange-500/40 text-orange-300'
                        }`}
                      >
                        {r.status === 'resolved' ? 'resolved' : 'open'}
                      </span>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-2 text-xs text-gray-400">
                      <p>
                        Pelapor:{' '}
                        <span className="text-white">
                          @{r.reporter?.username || r.reporter_id.slice(0, 8)}
                        </span>
                      </p>
                      <p>
                        Dilapor:{' '}
                        <span className="text-white">
                          @{r.reported?.username || r.reported_user_id.slice(0, 8)}
                        </span>
                      </p>
                      {r.video_id && (
                        <p className="sm:col-span-2">
                          Video:{' '}
                          <button
                            onClick={() => router.push(`/v/${r.video_id}`)}
                            className="text-purple-400 underline"
                          >
                            /v/{r.video_id.slice(0, 8)}…
                          </button>
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {r.status !== 'resolved' && (
                        <button
                          disabled={acting === r.id}
                          onClick={() => resolveReport(r.id)}
                          className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 border border-white/10 disabled:opacity-50"
                        >
                          Tandai selesai
                        </button>
                      )}
                      {r.video_id && (
                        <button
                          disabled={acting === r.id}
                          onClick={() => deleteVideo(r)}
                          className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20 disabled:opacity-50"
                        >
                          Hapus video
                        </button>
                      )}
                      <button
                        disabled={acting === r.id}
                        onClick={() => banUser(r)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-600/20 text-red-400 border border-red-500/30 disabled:opacity-50"
                      >
                        Ban user
                      </button>
                      <button
                        onClick={() =>
                          router.push(`/@${r.reported?.username || r.reported_user_id}`)
                        }
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 border border-white/10"
                      >
                        Lihat profil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'banned' && (
          <div className="space-y-3">
            {banned.length === 0 ? (
              <div className="rounded-2xl border border-white/10 py-16 text-center text-sm text-gray-500">
                Tidak ada user yang di-ban
              </div>
            ) : (
              banned.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-4 rounded-2xl border border-white/10 bg-white/[0.03]"
                >
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold bg-vezao-gradient">
                        {(u.username || 'U')[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {u.full_name || u.username}
                    </p>
                    <p className="text-xs text-gray-400">@{u.username}</p>
                  </div>
                  <button
                    disabled={acting === u.id}
                    onClick={() => unbanUser(u.id, u.username)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 disabled:opacity-50"
                  >
                    Unban
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-600 pb-8">
          VEZAO Admin · hanya is_admin
        </p>
      </div>
    </div>
  )
}