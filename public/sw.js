self.addEventListener('push', (event) => {
  let data = { title: 'VEZAO', body: 'Ada aktivitas baru', url: '/' }
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() }
    }
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'VEZAO', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})