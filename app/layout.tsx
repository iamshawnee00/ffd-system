'use client';
import './globals.css';
import { Poppins } from 'next/font/google';
import Sidebar from './components/Sidebar';
import { SidebarProvider, useSidebar } from './context/SidebarContext';
import { usePathname } from 'next/navigation';

const poppins = Poppins({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
});

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();
  const pathname = usePathname();

  // Check if the user is in the Client Portal
  const isClientPortal = pathname.startsWith('/client-portal');

  // If Client Portal, return without the Sidebar
  if (isClientPortal) {
    return (
      <main className="w-full bg-gray-50 min-h-screen overflow-x-clip">
        {children}
      </main>
    );
  }

  // Admin / Internal Staff Layout (With Sidebar)
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <div 
        className={`print:hidden hidden md:block flex-shrink-0 transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        <Sidebar />
      </div>
      
      <div className="md:hidden print:hidden">
        <Sidebar />
      </div>
      
      <main className="flex-1 w-full bg-gray-100 min-h-screen overflow-x-clip">
        {children}
      </main>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={poppins.className}>
        <SidebarProvider>
          <LayoutContent>{children}</LayoutContent>
        </SidebarProvider>
      </body>
    </html>
  );
}