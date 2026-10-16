import { useState } from 'react'
import { NavLink, Outlet, useMatch, useNavigate } from 'react-router'
import { ParkingCapture } from '../features/parking-lot/ParkingCapture'
import { useOpenParkingCount, useProject, useResumeProjectId, useSession } from '../hooks/useData'
import { useShortcuts } from '../hooks/useShortcuts'
import { GlobalTimerBar } from './GlobalTimerBar'
import { Icon } from './Icon'
import styles from './Layout.module.css'

export function Layout() {
  const parked = useOpenParkingCount()

  // P parks a thought from any page (the focus screen has its own). It's linked to the
  // project on screen, or else the one with a timer session, if any.
  const [parkOpen, setParkOpen] = useState(false)
  const onProject = useMatch('/project/:id')?.params.id
  const onOverview = !!useMatch('/')

  // While the resume bar shows, F goes back into focus from any page. The overview and project
  // pages handle F themselves (resume, or focus the selected / open project).
  const navigate = useNavigate()
  const resumeId = useResumeProjectId()
  const resume = resumeId && !onProject && !onOverview ? () => navigate(`/focus/${resumeId}`) : undefined
  useShortcuts({ p: () => setParkOpen(true), f: resume })
  const session = useSession()
  const linkProject = useProject(onProject ?? (session.state !== 'idle' ? session.projectId : undefined))
  const navClass = ({ isActive }: { isActive: boolean }) => [styles.navLink, isActive && styles.active].filter(Boolean).join(' ')
  return (
    <div className={styles.shell}>
      <GlobalTimerBar />
      <header className={styles.header}>
        <NavLink to="/" className={styles.brand} aria-label="Momentum overview">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={24} height={24} />
          <span>Momentum</span>
        </NavLink>
        <nav className={styles.nav} aria-label="Main">
          <NavLink to="/" end className={navClass}>
            Overview
          </NavLink>
          <NavLink to="/parking-lot" className={navClass}>
            Parking lot
            {parked > 0 && (
              <span className={styles.badge} aria-label={`${parked} open`}>
                {parked}
              </span>
            )}
          </NavLink>
          <NavLink to="/settings" className={navClass} aria-label="Settings" title="Settings">
            <Icon name="settings" size={18} />
          </NavLink>
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <ParkingCapture
        open={parkOpen}
        projectId={linkProject?.id}
        projectTitle={linkProject?.title}
        onClose={() => setParkOpen(false)}
      />
    </div>
  )
}
