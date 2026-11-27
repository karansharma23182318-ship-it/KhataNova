import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Login } from '../pages/auth/Login';
import { Register } from '../pages/auth/Register';
import { ShopSetup } from '../pages/onboarding/ShopSetup';
import { Home } from '../pages/dashboard/Home';
import { Sales } from '../pages/sales/Sales';
import { NewSale } from '../pages/sales/NewSale';
import { SaleDetails } from '../pages/sales/SaleDetails';
import { SmartCalculator } from '../pages/calculator/SmartCalculator';
import { Customers } from '../pages/customers/Customers';
import { NovaScan } from '../pages/scanner/NovaScan';
import { AddCustomer } from '../pages/customers/AddCustomer';
import { CustomerDetails } from '../pages/customers/CustomerDetails';
import { CustomerDirectory } from '../pages/customers/CustomerDirectory';
import { Udhaar } from '../pages/udhaar/Udhaar';
import { Payments } from '../pages/payments/Payments';
import { TakePayment } from '../pages/payments/TakePayment';
import { Reports } from '../pages/reports/Reports';
import { ShopProfile } from '../pages/profile/ShopProfile';
import { PremiumPlan } from '../pages/premium/PremiumPlan';
import { PremiumPayment } from '../pages/premium/PremiumPayment';
import { Support } from '../pages/support/Support';
import { SupportConversation } from '../pages/support/SupportConversation';
import { Settings } from '../pages/settings/Settings';
import { DueReminders } from '../pages/notifications/DueReminders';
import { AdminLogin } from '../pages/admin/AdminLogin';
import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { UserManagement } from '../pages/admin/UserManagement';
import { PremiumRequests } from '../pages/admin/PremiumRequests';
import { QRManagement } from '../pages/admin/QRManagement';
import { PaymentHistory } from '../pages/admin/PaymentHistory';
import { SupportManagement } from '../pages/admin/SupportManagement';
import { RevenueReports } from '../pages/admin/RevenueReports';
import { PlanManagement } from '../pages/admin/PlanManagement';
import { AdminSettings } from '../pages/admin/AdminSettings';
import { NotFound } from '../pages/errors/NotFound';
import { Unauthorized } from '../pages/errors/Unauthorized';
import { AdminRoute } from './AdminRoute';
import { ProtectedRoute } from './ProtectedRoute';

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/setup" element={<ShopSetup />} />
        </Route>

        <Route path="/" element={<Home />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/sales/new" element={<NewSale />} />
        <Route path="/sales/:id" element={<SaleDetails />} />
        <Route path="/calculator" element={<SmartCalculator />} />

        <Route path="/customers" element={<Customers />} />
        <Route path="/nova-scan" element={<NovaScan />} />
        <Route path="/customers/directory" element={<CustomerDirectory />} />
        <Route path="/customers/add" element={<AddCustomer />} />
        <Route path="/customers/:id" element={<CustomerDetails />} />

        <Route path="/udhaar" element={<Udhaar />} />
        <Route path="/notifications" element={<DueReminders />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/payments/take" element={<TakePayment />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/profile" element={<ShopProfile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/premium" element={<PremiumPlan />} />
        <Route path="/premium/pay" element={<PremiumPayment />} />
        <Route path="/support" element={<Support />} />
        <Route path="/support/:id" element={<SupportConversation />} />

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/admin/premium-requests" element={<PremiumRequests />} />
          <Route path="/admin/qr-management" element={<QRManagement />} />
          <Route path="/admin/payments" element={<PaymentHistory />} />
          <Route path="/admin/support" element={<SupportManagement />} />
          <Route path="/admin/reports" element={<RevenueReports />} />
          <Route path="/admin/plans" element={<PlanManagement />} />
          <Route path="/admin/website-settings" element={<AdminSettings />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
        </Route>

        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
