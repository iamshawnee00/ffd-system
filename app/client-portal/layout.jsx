export default function ClientLayout({ children }) {
  return (
    <div className="bg-gray-50 min-h-screen">
      {/* This is a nested layout for the client portal. 
        The Sidebar is already hidden by the Root Layout (app/layout.jsx).
      */}
      {children}
    </div>
  );
}