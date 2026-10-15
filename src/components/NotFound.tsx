import { Link } from 'react-router'
import styles from './Layout.module.css'

export function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <div className={styles.empty}>
      <p>This {what} isn't here any more.</p>
      <Link to="/">Back to overview</Link>
    </div>
  )
}
