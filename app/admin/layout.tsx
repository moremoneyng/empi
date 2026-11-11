"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/app/components/AdminSidebar";
import { useAdmin } from "@/app/context/AdminContext";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, isLoading } = useAdmin();
  const [isMounted, setIsMounted] = useState(false);

  // Check if current page is the login page
  const isLoginPage = pathname === '/admin/login';

  // Effect to mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Redirect to login if not authenticated and not on login page
  useEffect(() => {
    // Only check after mount and after loading completes
    if (!isMounted || isLoading) return;

    // If no admin and NOT on login page, redirect to login
    if (!admin && !isLoginPage) {
      console.log('[AdminLayout] ❌ Not authenticated, redirecting to login');
      router.push('/admin/login');
      return;
    }
  }, [admin, isLoading, isMounted, isLoginPage, router]);

  // If still loading context, show nothing (brief moment)
  if (!isMounted || isLoading) {
    return null;
  }

  // If not authenticated and NOT on login page, return null while redirect happens
  if (!admin && !isLoginPage) {
    return null;
  }

  // If on login page (not authenticated), render children without sidebar
  if (isLoginPage) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-lime-50 to-lime-100">
        {children}
      </div>
    );
  }

  // Only render sidebar and content when authenticated
  return (
    <SidebarProvider>
      <div className="flex w-full h-screen overflow-hidden">
        {/* Sidebar - visible on desktop, collapsible on mobile with hamburger menu */}
        <Suspense fallback={null}>
          <AdminSidebar />
        </Suspense>
        <main className="flex-1 w-full min-w-0 overflow-auto bg-gray-50 pt-14 md:pt-0">
          <div className="w-full h-full">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
