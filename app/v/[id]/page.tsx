import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import SingleVideoClient from '@/components/SingleVideoClient'

type Props = { params: Promise<{ id: string }> }

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = getAdmin()

  const { data: video } = await supabase
    .from('videos')
    .select(
      `
      id, caption, thumbnail_url, video_url,
      profiles ( username, full_name, avatar_url )
    `
    )
    .eq('id', id)
    .eq('is_draft', false)
    .maybeSingle()

  if (!video) {
    return {
      title: 'Video · SERULO',
      description: 'Tonton video pendek di SERULO',
    }
  }

  const username =
    (video as any).profiles?.username ||
    (video as any).profiles?.full_name ||
    'user'
  const caption = (video.caption || '').trim()
  const title = caption
    ? `${caption.slice(0, 60)}${caption.length > 60 ? '…' : ''} · SERULO`
    : `@${username} di SERULO`
  const description =
    caption.slice(0, 160) ||
    `Video dari @${username} di SERULO — Dunia Seru Versi Lo`

  const image =
    video.thumbnail_url ||
    (video as any).profiles?.avatar_url ||
    'https://serulo.app/icon-512.png'

  const url = `https://serulo.app/v/${id}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: 'SERULO',
      type: 'video.other',
      images: [
        {
          url: image,
          width: 720,
          height: 1280,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params
  return <SingleVideoClient />
}