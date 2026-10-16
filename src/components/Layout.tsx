import { NavLink, Outlet } from 'react-router'
import { useOpenParkingCount } from '../hooks/useData'
import { GlobalTimerBar } from './GlobalTimerBar'
import { Icon } from './Icon'
import styles from './Layout.module.css'

export function Layout() {
  const parked = useOpenParkingCount()
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
    </div>
  )
}
