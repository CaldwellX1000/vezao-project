export type StoredAccount = {
  id: string
  email: string
  username: string
  full_name: string
  avatar_url: string | null
  access_token: string
  refresh_token: string
}

const KEY = 'vezao_accounts'

export function getAccounts(): StoredAccount[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function saveAccount(account: StoredAccount) {
  const list = getAccounts().filter((a) => a.id !== account.id)
  list.unshift(account)
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8))) // max 8 akun
}

export function removeAccount(id: string) {
  const list = getAccounts().filter((a) => a.id !== id)
  localStorage.setItem(KEY, JSON.stringify(list))
}

export async function persistCurrentSession(supabase: any) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, full_name, avatar_url')
    .eq('id', session.user.id)
    .maybeSingle()

  saveAccount({
    id: session.user.id,
    email: session.user.email || '',
    username: profile?.username || 'user',
    full_name: profile?.full_name || profile?.username || 'user',
    avatar_url: profile?.avatar_url || null,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
}