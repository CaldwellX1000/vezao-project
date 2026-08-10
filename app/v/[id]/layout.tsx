import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'

type Props = { children: React.ReactNode; params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return { title: 'SERULO' }

  const supabase = createClient(url, key)
  const { data } = await supabase
    .from('videos')
    .select('caption, thumbnail_url, profiles(username)')
    .eq('id', id)
    .maybeSingle()

  const caption = (data as any)?.caption || 'Video SERULO'
  const thumb = (data as any)?.thumbnail_url as string | null
  const user = (data as any)?.profiles?.username || 'user'
  const title = `${caption.slice(0, 60)} · @${user}`
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://serulo.app'

  return {
    title,
    description: caption.slice(0, 120),
    openGraph: {
      title,
      description: caption.slice(0, 120),
      url: `${site}/v/${id}`,
      siteName: 'SERULO',
      images: thumb
        ? [{ url: thumb, width: 720, height: 1280, alt: caption.slice(0, 80) }]
        : [{ url: `${site}/icon-512.png`, width: 512, height: 512 }],
      type: 'video.other',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      images: thumb ? [thumb] : undefined,
    },
  }
}

export default function VideoLayout({ children }: { children: React.ReactNode }) {
  return children
}