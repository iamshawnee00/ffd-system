import './globals.css';
import { Inter } from 'next/font/google';
import Sidebar from './components/Sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'FFD System',
  description: 'Fresher Farm Direct Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex flex-col md:flex-row min-h-screen">
          {/* Sidebar: Hidden on print, adaptable width */}
          <div className="print:hidden md:w-64 flex-shrink-0">
            <Sidebar />
          </div>
          
          {/* Main Content: Takes remaining width, adapts padding */}
          <main className="flex-1 w-full md:w-auto overflow-x-hidden bg-gray-100 min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}