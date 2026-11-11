"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EnhancedDashboard } from "../components/EnhancedDashboard";
import { UsersPanel } from "./UsersPanel";
import { PendingPanel } from "./PendingPanel";
import { ProductsPanel } from "./ProductsPanel";
import { useSessionExpiry } from "@/lib/hooks/useSessionExpiry";
import { useResponsive } from "@/app/hooks/useResponsive";
import { useAdmin } from "@/app/context/AdminContext";
import { BarChart3, AlertTriangle } from "lucide-react";

function AdminDashboardContent() {
  const { mounted } = useResponsive();
  const { admin, isLoading: authLoading } = useAdmin();
  const searchParams = useSearchParams();

  const tabFromUrl = searchParams?.get('tab') as 'dashboard' | 'users' | 'pending' | 'products' | null;

  // Active dashboard tab (dashboard | users | pending | products)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'pending' | 'products'>(() => {
    if (tabFromUrl && ['dashboard', 'users', 'pending', 'products'].includes(tabFromUrl)) {
      return tabFromUrl;
    }
    return 'dashboard';
  });

  // Sync activeTab whenever URL query param changes
  useEffect(() => {
    if (tabFromUrl && ['dashboard', 'users', 'pending', 'products'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const canViewTab = useCallback((tab: 'dashboard' | 'users' | 'pending' | 'products') => {
    if (admin?.permissions?.includes('access_all_features')) return true;
    const permissionByTab = {
      dashboard: 'view_dashboard',
      users: 'view_users',
      pending: 'view_orders',
      products: 'view_products',
    } as const;
    return Boolean(admin?.permissions?.includes(permissionByTab[tab]));
  }, [admin?.permissions]);

  // Adjust default tab based on admin permissions
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (admin) {
        const canViewDashboard = canViewTab('dashboard');
        if (!canViewDashboard) {
          const fallback = (['pending', 'products', 'users'] as const).find(canViewTab);
          if (fallback) {
            setActiveTab(fallback);
            window.dispatchEvent(new CustomEvent('adminTabChange', { detail: { tab: fallback } }));
          }
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [admin, canViewTab]);

  // Use session expiry hook to detect logout
  const { sessionError } = useSessionExpiry();

  // Listen for same-window tab changes dispatched by the sidebar
  useEffect(() => {
    const onAdminTabChange = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail;
        if (detail && detail.tab) {
          const t = detail.tab;
          if (t === 'dashboard' || t === 'users' || t === 'pending' || t === 'products') {
            if (canViewTab(t)) {
              setActiveTab(t);
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('tab', t);
                window.history.replaceState({}, '', url.toString());
              }
            }
          }
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('adminTabChange', onAdminTabChange as EventListener);
    return () => window.removeEventListener('adminTabChange', onAdminTabChange as EventListener);
  }, [canViewTab]);

  // Early returns AFTER all hooks are called
  if (!mounted || authLoading) {
    return null;
  }

  if (!(['dashboard', 'users', 'pending', 'products'] as const).some(canViewTab)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-xl font-black text-gray-900">No dashboard access assigned</h1>
          <p className="mt-2 text-sm text-gray-600">Ask the Super Admin to assign at least one dashboard, customer, order, or product permission.</p>
        </div>
      </div>
    );
  }

  // Show session error banner if present
  if (mounted && sessionError) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Session Expired</h1>
          <p className="text-gray-600 mb-6">{sessionError}</p>
          <a
            href="/admin/login"
            className="inline-block bg-lime-600 hover:bg-lime-700 text-white font-semibold py-2 px-6 rounded-lg transition"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-6 md:pb-0">
      <main className="px-4 sm:px-6 lg:px-8 py-6 md:py-8 w-full pb-6 md:pb-0">
        {activeTab === 'dashboard' && canViewTab('dashboard') && (
          <div className="animate-fadeIn">
            <EnhancedDashboard />
          </div>
        )}

        {activeTab === 'users' && canViewTab('users') && (
          <div className="animate-fadeIn">
            <UsersPanel />
          </div>
        )}

        {activeTab === 'pending' && canViewTab('pending') && (
          <div className="animate-fadeIn">
            <PendingPanel />
          </div>
        )}

        {activeTab === 'products' && canViewTab('products') && (
          <div className="animate-fadeIn">
            <ProductsPanel />
          </div>
        )}
      </main>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-4xl">
          <div className="h-20 bg-gray-200 rounded-xl"></div>
          <div className="h-64 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    }>
      <AdminDashboardContent />
    </Suspense>
  );
}
