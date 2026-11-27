export interface NavItemConfig {
  id: string;
  path: string;
  labelKey: string;
  iconName:
    | 'Home'
    | 'ReceiptIndianRupee'
    | 'Users'
    | 'BookOpenCheck'
    | 'Wallet'
    | 'BarChart3'
    | 'Store'
    | 'Settings'
    | 'LifeBuoy'
    | 'Crown'
    | 'Calculator'
    | 'ClipboardList'
    | 'Bell'
    | 'ScanBarcode';
  mobilePrimary?: boolean;
}

export const USER_NAVIGATION: NavItemConfig[] = [
  { id: 'home', path: '/', labelKey: 'nav.home', iconName: 'Home', mobilePrimary: true },
  { id: 'sales', path: '/sales', labelKey: 'nav.sales', iconName: 'ReceiptIndianRupee', mobilePrimary: true },
  { id: 'calculator', path: '/calculator', labelKey: 'nav.calculator', iconName: 'Calculator' },
  { id: 'customers', path: '/customers', labelKey: 'nav.customers', iconName: 'Users', mobilePrimary: true },
  { id: 'nova-scan', path: '/nova-scan', labelKey: 'nav.novaScan', iconName: 'ScanBarcode', mobilePrimary: true },
  { id: 'customer-directory', path: '/customers/directory', labelKey: 'nav.customerDirectory', iconName: 'ClipboardList' },
  { id: 'udhaar', path: '/udhaar', labelKey: 'nav.udhaar', iconName: 'BookOpenCheck', mobilePrimary: true },
  { id: 'notifications', path: '/notifications', labelKey: 'nav.dueReminders', iconName: 'Bell' },
  { id: 'payments', path: '/payments', labelKey: 'nav.payments', iconName: 'Wallet' },
  { id: 'reports', path: '/reports', labelKey: 'nav.reports', iconName: 'BarChart3' },
  { id: 'profile', path: '/profile', labelKey: 'nav.profile', iconName: 'Store' },
  { id: 'settings', path: '/settings', labelKey: 'nav.settings', iconName: 'Settings' },
  { id: 'support', path: '/support', labelKey: 'nav.support', iconName: 'LifeBuoy' },
  { id: 'premium', path: '/premium', labelKey: 'nav.premium', iconName: 'Crown' },
];

export interface AdminNavItemConfig {
  id: string;
  path: string;
  label: string;
  iconName:
    | 'LayoutDashboard'
    | 'Users'
    | 'BadgeIndianRupee'
    | 'QrCode'
    | 'MessageSquareText'
    | 'History'
    | 'FileBarChart'
    | 'Crown'
    | 'Globe'
    | 'ShieldCheck';
}

export const ADMIN_NAVIGATION: AdminNavItemConfig[] = [
  { id: 'dashboard', path: '/admin', label: 'Dashboard', iconName: 'LayoutDashboard' },
  { id: 'users', path: '/admin/users', label: 'Dukandar Management', iconName: 'Users' },
  { id: 'premium-requests', path: '/admin/premium-requests', label: 'Premium Requests', iconName: 'BadgeIndianRupee' },
  { id: 'qr-management', path: '/admin/qr-management', label: 'QR Code Management', iconName: 'QrCode' },
  { id: 'support', path: '/admin/support', label: 'Support Messages', iconName: 'MessageSquareText' },
  { id: 'payment-history', path: '/admin/payments', label: 'Payment History', iconName: 'History' },
  { id: 'reports', path: '/admin/reports', label: 'User Reports', iconName: 'FileBarChart' },
  { id: 'plans', path: '/admin/plans', label: 'Premium Plan Management', iconName: 'Crown' },
  { id: 'website-settings', path: '/admin/website-settings', label: 'Website Settings', iconName: 'Globe' },
  { id: 'admin-settings', path: '/admin/settings', label: 'Admin Settings', iconName: 'ShieldCheck' },
];
