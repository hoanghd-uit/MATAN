'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar} id="app-sidebar">
      <div className={styles.logoSection}>
        <div className={styles.logoIcon}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="20" height="12" x="2" y="6" rx="2" />
            <path d="M6 12h4M8 10v4M15 11h.01M18 13h.01" />
          </svg>
        </div>
        <span className={styles.logoText}>MAGAN Tool</span>
      </div>

      <nav className={styles.nav}>
        <Link
          href="/"
          className={`${styles.navItem} ${pathname === '/' ? styles.navItemActive : ''}`}
          title="Annotator: Upload"
        >
          <div className={styles.icon}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </div>
          <span className={styles.label}>Annotator: Upload</span>
        </Link>

        <Link
          href="/researcher-voting"
          className={`${styles.navItem} ${pathname === '/researcher-voting' ? styles.navItemActive : ''}`}
          title="Researcher: Voting"
        >
          <div className={styles.icon}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <span className={styles.label}>Researcher: Voting</span>
        </Link>

        <Link
          href="/researcher-agreement"
          className={`${styles.navItem} ${pathname === '/researcher-agreement' ? styles.navItemActive : ''}`}
          title="Researcher: Krippendorff"
        >
          <div className={styles.icon}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <span className={styles.label}>Researcher: Krippendorff</span>
        </Link>
      </nav>

      <div className={styles.footer}>
        <span className={styles.footerText}>v1.0</span>
      </div>
    </aside>
  );
}
