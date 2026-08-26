'use client';

import { usePathname } from 'next/navigation';
import { useSessionStore } from '@/lib/store';
import Sidebar from './Sidebar';
import styles from './AppLayout.module.css';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sessionState = useSessionStore((state) => state.sessionState);

  // The sidebar is shown on the researcher page or on the homepage during the upload phase
  const showSidebar = pathname === '/researcher-voting' || pathname === '/researcher-agreement' || (pathname === '/' && sessionState === 'upload');

  return (
    <div className={styles.layoutContainer}>
      {showSidebar && <Sidebar />}
      <div className={`${styles.contentWrapper} ${showSidebar ? styles.hasSidebar : ''}`}>
        {children}
      </div>
    </div>
  );
}
