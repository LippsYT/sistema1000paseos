

"use client";

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { CreditCard, FileText, LayoutDashboard, LogOut, Shield, Users, Building2, Bell, Truck, FileWarning, Sun, Moon, Archive, UserCircle, Car, Users2, ChevronDown, Landmark, Settings, MessageSquare, BookOpen, FileUp, Briefcase, NotebookText } from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar
} from '@/components/ui/sidebar';
import { Logo } from './icons';
import { useAuth } from '@/context/auth-context';
import { signOut } from '@/lib/auth';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { getBookings, getAgencies, getGuides, subscribeToUserChats } from '@/lib/data';
import type { Booking, User, Agency, Guide, ChatWithUnread } from '@/lib/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { useSettings } from '@/context/settings-context';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { hasPermission } from '@/lib/permissions';


const allMenuItems: ({ id?: string; href?: string; label: string; icon: React.ElementType; roles?: User['role'][]; permission?: string, subItems?: Omit<typeof allMenuItems[0], 'subItems' | 'roles'>[] & { roles?: User['role'][], permission?: string }[] })[] = [
  { href: '/', label: 'Panel', icon: LayoutDashboard, permission: 'CAN_VIEW_DASHBOARD' },
  { href: '/services', label: 'Servicios', icon: Briefcase, permission: 'CAN_MANAGE_SERVICES' },
  { href: '/descriptions', label: 'Descriptivos', icon: BookOpen, permission: 'CAN_VIEW_DESCRIPTIONS' },
  { href: '/notifications', label: 'Notificaciones', icon: Bell, permission: 'CAN_VIEW_NOTIFICATIONS' },
  { href: '/chat', label: 'Chat', icon: MessageSquare, roles: ['super-admin', 'admin', 'agent', 'guia', 'hotel'] },
  { href: '/agencies', label: 'Agencias', icon: Building2, permission: 'CAN_MANAGE_AGENCIES' },
  { href: '/hotels', label: 'Hoteles', icon: Landmark, permission: 'CAN_MANAGE_AGENCIES' },
  { href: '/providers', label: 'Proveedores', icon: Truck, permission: 'CAN_MANAGE_PROVIDERS' },
  { 
    id: 'resources',
    label: 'Recursos', 
    icon: Users2, 
    permission: 'CAN_VIEW_RESOURCES_MENU',
    subItems: [
        { href: '/guides', label: 'Guías', icon: UserCircle, permission: 'CAN_MANAGE_GUIDES' },
        { href: '/vehicles', label: 'Vehículos', icon: Car, permission: 'CAN_MANAGE_VEHICLES' },
    ]
  },
  { 
    id: 'payments',
    label: 'Pagos', 
    icon: CreditCard, 
    permission: 'CAN_VIEW_PAYMENTS_MENU',
    subItems: [
        { href: '/payments', label: 'Liquidaciones', icon: CreditCard, permission: 'CAN_MANAGE_SETTLEMENTS' },
        { href: '/payments/accounts', label: 'Cuentas Bancarias', icon: Landmark, permission: 'CAN_MANAGE_PAYMENT_ACCOUNTS' },
        { href: '/payments/archive', label: 'Archivo', icon: Archive, permission: 'CAN_VIEW_ARCHIVE' },
    ]
  },
  { href: '/reports', label: 'Reportes', icon: FileText, permission: 'CAN_VIEW_REPORTS' },
  { href: '/csv-imports', label: 'Importaciones', icon: FileUp, permission: 'CAN_REVIEW_BOOKINGS' }, 
  { href: '/review', label: 'Revisión', icon: FileWarning, permission: 'CAN_REVIEW_BOOKINGS' },
  { href: '/actions-log', label: 'Registro de Acciones', icon: NotebookText, permission: 'CAN_MANAGE_AGENCIES' },
  { 
    id: 'settings',
    label: 'Configuración', 
    icon: Settings, 
    permission: 'CAN_VIEW_SETTINGS_MENU',
    subItems: [
        { href: '/profile', label: 'Mi Perfil', icon: UserCircle, permission: 'CAN_EDIT_OWN_PROFILE' },
        { href: '/users', label: 'Usuarios', icon: Users, permission: 'CAN_MANAGE_USERS' },
        { href: '/settings', label: 'General', icon: Settings, permission: 'CAN_MANAGE_APP_SETTINGS' },
    ]
  },
];

function ProtectedAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, setUser, isLoading } = useAuth();
  const { settings } = useSettings();
  const { theme, setTheme } = useTheme();
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [agencies, setAgencies] = React.useState<Agency[]>([]);
  const [guides, setGuides] = React.useState<Guide[]>([]);
  const [unreadChatsCount, setUnreadChatsCount] = React.useState(0);


  React.useEffect(() => {
    async function fetchData() {
      if (user) {
        if (hasPermission(user, 'CAN_REVIEW_BOOKINGS')) {
            const allBookings = await getBookings();
            setBookings(allBookings);
        }
         const [allAgencies, allGuides] = await Promise.all([
            getAgencies(),
            getGuides(),
        ]);
        setAgencies(allAgencies);
        setGuides(allGuides);
      }
    }
    fetchData();
  }, [user]);

  React.useEffect(() => {
    if (user?.id) {
        const unsubscribe = subscribeToUserChats(user.id, (chats: ChatWithUnread[]) => {
            const totalUnread = chats.reduce((acc, chat) => acc + chat.unreadCount, 0);
            setUnreadChatsCount(totalUnread);
        });
        return () => unsubscribe();
    }
  }, [user?.id]);

  React.useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    router.push('/login');
  };

  if (isLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Cargando...</p>
      </div>
    );
  }

  const menuItems = allMenuItems.filter(item => {
    if (item.roles) return item.roles.includes(user.role);
    if (item.permission) return hasPermission(user, item.permission as any);
    if (item.subItems) {
      return item.subItems.some(subItem => {
        if (subItem.roles) return subItem.roles.includes(user.role);
        if (subItem.permission) return hasPermission(user, subItem.permission as any);
        return false;
      });
    }
    return false;
  });
  
  const getRoleBadge = () => {
    switch (user.role) {
      case 'super-admin': return <Badge variant="destructive">Super Admin</Badge>;
      case 'admin': return <Badge variant="secondary">Admin</Badge>;
      case 'agent': return <Badge variant="outline">{user.agencyName || "Agente"}</Badge>;
      case 'vendedor': return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">Vendedor</Badge>;
      case 'guia': return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Guía</Badge>;
      case 'hotel': return <Badge variant="default" className="bg-purple-600 hover:bg-purple-700">{user.name}</Badge>;
      default: return <Badge>{user.role}</Badge>;
    }
  };
  
  const bookingsForReviewCount = bookings.filter(b => 
    b.status === 'Pending Review' || 
    b.status === 'Pending Cancellation' ||
    b.status === 'Pending Quote'
  ).length;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            {settings.appLogo ? (
                <Image src={settings.appLogo} alt={settings.appName} width={32} height={32} className="rounded-full"/>
            ) : (
                <Logo className="w-8 h-8 text-primary" />
            )}
            <span className="font-headline text-xl font-semibold">{settings.appName}</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => (
              item.subItems ? (
                 <Collapsible key={item.id} className="w-full" defaultOpen={item.subItems.some(subItem => subItem.href && pathname.startsWith(subItem.href))}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center gap-2">
                                <item.icon />
                                <span>{item.label}</span>
                            </div>
                            <div className="group-data-[state=open]:rotate-180">
                                <ChevronDown className="h-4 w-4" />
                            </div>
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                    </SidebarMenuItem>
                    <CollapsibleContent>
                       <SidebarMenuSub>
                           {item.subItems.filter(subItem => {
                                if (subItem.roles) return subItem.roles.includes(user.role);
                                if (subItem.permission) return hasPermission(user, subItem.permission as any);
                                return false;
                           }).map((subItem) => (
                                <SidebarMenuSubItem key={subItem.href}>
                                    <SidebarMenuSubButton asChild isActive={pathname === subItem.href}>
                                        <Link href={subItem.href!}>
                                             <subItem.icon />
                                            <span>{subItem.label}</span>
                                        </Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                           ))}
                       </SidebarMenuSub>
                    </CollapsibleContent>
                </Collapsible>
              ) : (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href!}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                     {item.href === '/review' && bookingsForReviewCount > 0 && (
                      <SidebarMenuBadge>{bookingsForReviewCount}</SidebarMenuBadge>
                    )}
                    {item.href === '/chat' && unreadChatsCount > 0 && (
                        <SidebarMenuBadge>{unreadChatsCount}</SidebarMenuBadge>
                    )}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              )
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
           <div className="flex items-center justify-center gap-2 p-2 group-data-[collapsible=icon]:hidden">
              <Sun className="h-5 w-5" />
              <Switch
                id="theme-switch"
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
              <Moon className="h-5 w-5" />
          </div>
          <Button variant="ghost" onClick={handleSignOut} className="w-full justify-start">
             <LogOut className="mr-2 h-4 w-4" />
             <span>Cerrar Sesión</span>
          </Button>
          <div className="flex items-center justify-between text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            <span>&copy; {new Date().getFullYear()} {settings.appName}</span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:h-16 sm:px-6">
          <SidebarTrigger />
           <div className="flex-1 flex items-center justify-end">
              <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-medium">
                      {user.name}
                    </span>
                    {getRoleBadge()}
                  </div>
                  <div className="relative flex items-center">
                    <Avatar className="h-10 w-10 border-2 border-background">
                        <AvatarImage src={settings.appLogo ?? undefined} alt="Logo del Sistema" />
                        <AvatarFallback><Logo/></AvatarFallback>
                    </Avatar>
                    <Avatar className="absolute -bottom-2 -right-2 h-6 w-6 border-2 border-background">
                        <AvatarImage src={user.photoURL ?? undefined} alt={user.name} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                  </div>
              </div>
           </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}


export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (pathname === '/login' || pathname === '/export') {
        return <>{children}</>;
    }

    if (!isClient) {
        return (
            <div className="flex h-screen items-center justify-center">
                <p>Cargando...</p>
            </div>
        );
    }
    
    return <ProtectedAppShell>{children}</ProtectedAppShell>;
}
