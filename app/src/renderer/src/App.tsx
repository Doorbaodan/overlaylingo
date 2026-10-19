import { useEffect, useState } from 'react'
import Main from './pages/Main'
import Bubble from './pages/Bubble'
import Panel from './pages/Panel'
import Selection from './pages/Selection'
import Capture from './pages/Capture'

type Route = 'main' | 'bubble' | 'panel' | 'selection' | 'capture'

function resolveRoute(): Route {
  const h = window.location.hash
  if (h.startsWith('#/bubble')) return 'bubble'
  if (h.startsWith('#/panel')) return 'panel'
  if (h.startsWith('#/selection')) return 'selection'
  if (h.startsWith('#/capture')) return 'capture'
  return 'main'
}

export default function App() {
  const [route, setRoute] = useState<Route>(resolveRoute())

  useEffect(() => {
    const onHash = (): void => setRoute(resolveRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (route === 'bubble') return <Bubble />
  if (route === 'panel') return <Panel />
  if (route === 'selection') return <Selection />
  if (route === 'capture') return <Capture />
  return <Main />
}
