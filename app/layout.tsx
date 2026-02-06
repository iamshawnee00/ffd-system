'use client';
import './globals.css';
import { Analytics } from "@vercel/analytics/next"
import { Poppins } from 'next/font/google';
import Sidebar from './components/Sidebar';
import { SidebarProvider, useSidebar } from './context/SidebarContext';

const poppins = Poppins({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
});

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Sidebar container - This div acts as a spacer for the fixed sidebar */}
      <div 
        className={`print:hidden hidden md:block flex-shrink-0 transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        <Sidebar />
      </div>
      
      {/* Mobile Sidebar wrapper */}
      <div className="md:hidden print:hidden">
        <Sidebar />
      </div>
      
      {/* Main content area */}
      <main className="flex-1 w-full bg-gray-100 min-h-screen overflow-x-hidden">
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
          <Analytics />
        </SidebarProvider>
      </body>
    </html>
  );
}