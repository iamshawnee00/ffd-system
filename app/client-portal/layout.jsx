/**
 * @param {{ children: React.ReactNode }} props
 */
export default function ClientLayout({ children }) {
  return (
    <div className="bg-gray-50 min-h-screen">
      {/* This layout deliberately DOES NOT include the Sidebar.
         It creates a focused environment for external clients.
      */}
      {children}
    </div>
  );
}