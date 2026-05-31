import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-60" />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* 生育进度条 */}
        <Card><CardContent className="pt-4 pb-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
        {/* 累计指标 */}
        <div className="grid grid-cols-2 gap-3">
          <Card><CardContent className="pt-4 pb-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
        </div>
        {/* 统计卡片 */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="pt-4 pb-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        {/* 预报 */}
        <Card><CardContent className="pt-4 pb-4"><Skeleton className="h-40 w-full" /></CardContent></Card>
        {/* 适宜度 */}
        <Card><CardContent className="pt-4 pb-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
        {/* 图表 */}
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent><Skeleton className="h-64 w-full" /></CardContent>
          </Card>
        ))}
      </main>
    </div>
  )
}
