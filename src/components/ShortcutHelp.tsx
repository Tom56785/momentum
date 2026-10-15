import { Dialog } from './Dialog'
import styles from './ShortcutHelp.module.css'

const GROUPS: { title: string; rows: [keys: string[], action: string][] }[] = [
  {
    title: 'Focus screen',
    rows: [
      [['Space'], 'Start or stop work'],
      [['Ctrl/Cmd', 'Enter'], 'Complete current subtask'],
      [['B'], 'Start or end break'],
      [['P'], 'Park a thought'],
      [['C'], 'Start challenge'],
      [['T'], 'Reveal or hide time'],
      [['N'], 'Focus the notes area'],
      [['F'], 'Toggle fullscreen'],
      [['Esc'], 'Exit focus'],
    ],
  },
  {
    title: 'Overview and project',
    rows: [
      [['↑', '↓'], 'Move between projects'],
      [['Enter'], 'Open project'],
      [['F'], 'Start focus on the selected project'],
      [['I'], 'Import (overview)'],
      [['Alt', '↑/↓'], 'Move a subtask up or down'],
    ],
  },
  {
    title: 'Parking lot page',
    rows: [
      [['↑', '↓'], 'Move between items'],
      [['Enter'], 'Expand item'],
      [['S'], 'Add selected item as a subtask'],
      [['D'], 'Mark selected item done'],
    ],
  },
  {
    title: 'Anywhere',
    rows: [
      [['Esc'], 'Close a dialog, or leave a text field'],
      [['?'], 'Show all shortcuts'],
    ],
  },
]

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" size="wide">
      <div className={styles.grid}>
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <dl className={styles.list}>
              {group.rows.map(([keys, action]) => (
                <div key={action} className={styles.row}>
                  <dt>
                    {keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && <span className={styles.plus}>+</span>}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className={styles.note}>Shortcuts pause while you're typing in a field, except Esc.</p>
    </Dialog>
  )
}
