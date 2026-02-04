import './globals.css';
import { Poppins } from 'next/font/google';
import Sidebar from './components/Sidebar'; // Added missing import
import type { Metadata } from 'next';

const poppins = Poppins({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: 'Fresher Farm Direct',
  description: 'Internal Operations System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={poppins.className}>
        <div className="flex flex-col md:flex-row min-h-screen">
          {/* Sidebar container - hidden on print */}
          <div className="print:hidden w-full md:w-64 flex-shrink-0 z-50">
            <Sidebar />
          </div>
          
          {/* Main content - adjusts margin/padding for mobile */}
          <main className="flex-1 w-full bg-gray-100 min-h-screen overflow-x-hidden">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}